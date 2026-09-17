import {
  AuthenticationError,
  LayloAPIError,
  LayloConfigurationError,
  LayloConnectionError,
  LayloTimeoutError,
} from "./errors.js";
import { buildQuery } from "./query.js";
import {
  backoffMs,
  DEFAULT_MAX_RETRIES,
  isRetryableStatus,
  MAX_DELAY_MS,
  parseRetryAfter,
} from "./retry.js";

/** HTTP methods used by the API. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Settings for the underlying transport. */
export interface HttpClientOptions {
  /** Origin and path prefix every request is joined onto. */
  baseUrl: string;
  /** `fetch` implementation; defaults to the global one. */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  /** Retries after the first attempt. */
  maxRetries?: number;
  /** Value sent as `User-Agent`. */
  userAgent: string;
  /** Value sent as `X-Laylo-Source`, identifying the integration. */
  source?: string;
}

/** Supplies and refreshes the access token sent as the bearer. */
export interface BearerTokenProvider {
  /** Returns a valid access token, minting one if needed. */
  getToken(signal?: AbortSignal): Promise<string>;
  /** Drops the given token from the cache after the API rejects it. */
  invalidate(staleToken?: string): void;
}

/** Credentials to attach to a single request. */
export interface RequestAuth {
  /** Access token sent as `Authorization: Bearer …`, or a provider of one. */
  bearer?: string | BearerTokenProvider;
  /** Customer API key sent as `X-Api-Key`. */
  apiKey?: string | undefined;
  /**
   * Laylo user id of a customer on the integrator's roster, sent as
   * `X-Creator-Id`. Names the customer without an API key.
   */
  creatorId?: string | undefined;
}

/** Everything needed to make one API call. */
export interface HttpRequest {
  method: HttpMethod;
  /** Path starting with `/v1/`. */
  path: string;
  query?: Record<string, unknown> | undefined;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: RequestAuth;
  /** Caller-owned signal; aborting it rejects with the caller's `AbortError`. */
  signal?: AbortSignal | undefined;
  /** Overrides the client-wide timeout for this request. */
  timeoutMs?: number | undefined;
  /**
   * Set to `false` to disable retries for this request's own attempts. The
   * one-shot replay after a rejected bearer still happens, and a token mint
   * keeps its own schedule.
   */
  retry?: boolean | undefined;
  /**
   * Marks a POST or PATCH as safe to replay so transient failures are
   * retried like a GET. Only for reads that happen to use a write verb.
   */
  idempotent?: boolean | undefined;
}

/** A successful API response. */
export interface HttpResponse<T> {
  /** Parsed body; `undefined` for `204 No Content`. */
  data: T;
  /** The underlying `Response`, for header inspection. */
  response: Response;
}

const joinUrl = (baseUrl: string, path: string, query?: URLSearchParams) => {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const search = query?.toString();
  return search ? `${url}?${search}` : url;
};

const parseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

// Replaying a write the server may already have committed can duplicate it,
// and the API has no idempotency header to guard against that. So a POST or
// PATCH is only retried when the server never processed it: the request got
// no response at all, or was turned away with a 429.
const isIdempotent = (method: HttpMethod) =>
  method !== "POST" && method !== "PATCH";

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const parseUrl = (url: string, request: HttpRequest): void => {
  try {
    new URL(url);
  } catch {
    throw new LayloConfigurationError(
      `Cannot build a valid URL for ${request.method} ${request.path} from "${url}"`,
    );
  }
};

interface Attempt {
  response: Response;
  body: unknown;
}

interface Failure {
  error: LayloConnectionError;
  /** Whether the server can be assumed not to have processed the request. */
  unsent: boolean;
}

const TIMED_OUT = Symbol("laylo.node.timeout");

/**
 * The single path every SDK call takes to the network. Owns headers, query
 * serialization, timeouts, retries, and turning error responses into the
 * typed errors exported by the package.
 */
export class HttpClient {
  private readonly options: Required<Omit<HttpClientOptions, "source">> & {
    source: string | undefined;
  };

  /**
   * @param options Transport settings shared by every request.
   */
  constructor(options: HttpClientOptions) {
    this.options = {
      baseUrl: options.baseUrl,
      fetch: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      userAgent: options.userAgent,
      source: options.source,
    };
  }

  /**
   * Performs a request, retrying transient failures, and returns the parsed
   * body along with the raw response. When the bearer comes from a provider
   * and the API rejects it with a 401 that does not blame the customer key,
   * the token is re-minted and the request replayed once.
   * @param request The request to make.
   * @returns The parsed body and the underlying response.
   */
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const bearer = request.auth?.bearer;
    // The null check is runtime defense for untyped callers, not dead code.
    if (bearer === null || typeof bearer !== "object") {
      return this.perform(request, bearer ?? undefined);
    }

    // Checked before the token mint so a malformed base URL is reported
    // against the call the user made, not against the token endpoint.
    parseUrl(this.urlFor(request), request);

    const token = await this.getTokenWithin(bearer, request);
    try {
      return await this.perform(request, token);
    } catch (error) {
      // Any 401 can mean the bearer went stale (expiry, a server-side secret
      // rotation) except one that blames the customer key, where a fresh
      // token cannot help. Bearer 401s carry no machine-readable marker —
      // only the customer-key rejection does — so replaying on everything
      // else costs at most one futile mint. A creator id the API cannot
      // resolve is permanent but arrives unmarked, so it pays that cost on
      // every call, and the re-mint is shared with the client's other
      // customers.
      if (
        !(error instanceof AuthenticationError) ||
        error.apiKeyStatus === "invalid"
      ) {
        throw error;
      }
      bearer.invalidate(token);
      return this.perform(request, await this.getTokenWithin(bearer, request));
    }
  }

  // Bounds this caller's wait for a token by their own timeout; a mint shared
  // with other callers keeps going for them when this wait is cut short.
  private async getTokenWithin(
    bearer: BearerTokenProvider,
    request: HttpRequest,
  ): Promise<string> {
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs;
    const minted = bearer.getToken(request.signal);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        minted.catch(() => undefined);
        reject(
          new LayloTimeoutError(
            `Request to ${request.method} ${request.path} timed out after ${timeoutMs}ms waiting for an access token`,
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([minted, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  private urlFor(request: HttpRequest): string {
    return joinUrl(
      this.options.baseUrl,
      request.path,
      request.query ? buildQuery(request.query) : undefined,
    );
  }

  private async perform<T>(
    request: HttpRequest,
    bearer: string | undefined,
  ): Promise<HttpResponse<T>> {
    const url = this.urlFor(request);
    parseUrl(url, request);
    const headers = this.buildHeaders(request, bearer);
    const body =
      request.body === undefined ? undefined : JSON.stringify(request.body);
    const maxRetries = request.retry === false ? 0 : this.options.maxRetries;
    const idempotent = request.idempotent ?? isIdempotent(request.method);

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.send(url, request, headers, body);
      const canRetry = attempt < maxRetries;

      if ("error" in outcome) {
        if (canRetry && (idempotent || outcome.unsent)) {
          await this.wait(backoffMs(attempt), request.signal);
          continue;
        }
        throw outcome.error;
      }

      const { response } = outcome;
      if (response.ok) {
        return { data: outcome.body as T, response };
      }
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      if (
        canRetry &&
        isRetryableStatus(response.status) &&
        (idempotent || response.status === 429) &&
        (retryAfter === undefined || retryAfter * 1000 <= MAX_DELAY_MS)
      ) {
        await this.wait(backoffMs(attempt, retryAfter), request.signal);
        continue;
      }
      throw LayloAPIError.fromResponse(response, outcome.body);
    }
  }

  private buildHeaders(
    request: HttpRequest,
    bearer: string | undefined,
  ): Headers {
    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": this.options.userAgent,
    });
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      headers.set(name, value);
    }
    if (request.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (this.options.source !== undefined) {
      headers.set("X-Laylo-Source", this.options.source);
    }
    if (bearer !== undefined) {
      headers.set("Authorization", `Bearer ${bearer}`);
    }
    if (request.auth?.apiKey !== undefined) {
      headers.set("X-Api-Key", request.auth.apiKey);
    }
    if (request.auth?.creatorId !== undefined) {
      headers.set("X-Creator-Id", request.auth.creatorId);
    }
    return headers;
  }

  // Waits between attempts. A caller abort cuts the wait short and surfaces
  // as their own AbortError, same as if it had happened mid-request.
  private wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason as Error);
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason as Error);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  // One attempt: the fetch and the body read together share the timeout, so
  // a server that sends headers and then stalls still times out. Resolves
  // with a Failure, rather than throwing, when the network failed so the
  // retry loop can decide what to do. Timeouts and caller aborts are thrown
  // straight through: neither is retried.
  //
  // The per-attempt controller is wired to the caller's signal by hand rather
  // than with AbortSignal.any(): Node keeps every composite signal alive for
  // as long as its sources, which leaks on a long-lived caller signal.
  private async send(
    url: string,
    request: HttpRequest,
    headers: Headers,
    body: string | undefined,
  ): Promise<Attempt | Failure> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs;
    const timer = setTimeout(() => controller.abort(TIMED_OUT), timeoutMs);
    const onAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", onAbort, { once: true });
    if (request.signal?.aborted) {
      onAbort();
    }

    const fail = (error: unknown, unsent: boolean): Failure | never => {
      if (controller.signal.reason === TIMED_OUT) {
        throw new LayloTimeoutError(
          `Request to ${request.method} ${request.path} timed out after ${timeoutMs}ms`,
          { cause: error },
        );
      }
      if (request.signal?.aborted) {
        throw request.signal.reason;
      }
      return {
        error: new LayloConnectionError(
          `Request to ${request.method} ${request.path} failed: ${describe(error)}`,
          { cause: error },
        ),
        unsent,
      };
    };

    try {
      let response: Response;
      try {
        response = await this.options.fetch(url, {
          method: request.method,
          headers,
          signal: controller.signal,
          ...(body === undefined ? {} : { body }),
        });
      } catch (error) {
        return fail(error, true);
      }
      try {
        return { response, body: await parseBody(response) };
      } catch (error) {
        // Headers arrived, so the server may well have acted on the request.
        return fail(error, false);
      }
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
}
