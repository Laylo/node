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
  /** Drops the cached token after the API reports it expired. */
  invalidate(): void;
}

/** Credentials to attach to a single request. */
export interface RequestAuth {
  /** Access token sent as `Authorization: Bearer …`, or a provider of one. */
  bearer?: string | BearerTokenProvider;
  /** API key sent as `X-Api-Key`. */
  apiKey?: string;
}

/** Everything needed to make one API call. */
export interface HttpRequest {
  method: HttpMethod;
  /** Path starting with `/v1/`. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: RequestAuth;
  /** Caller-owned signal; aborting it rejects with the caller's `AbortError`. */
  signal?: AbortSignal;
  /** Overrides the client-wide timeout for this request. */
  timeoutMs?: number;
  /** Set to `false` to disable retries for this request. */
  retry?: boolean;
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
   * and the API reports it expired, the token is re-minted and the request
   * replayed once.
   * @param request The request to make.
   * @returns The parsed body and the underlying response.
   */
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const bearer = request.auth?.bearer;
    if (bearer === null || typeof bearer !== "object") {
      return this.perform(request, bearer ?? undefined);
    }

    try {
      return await this.perform(request, await bearer.getToken(request.signal));
    } catch (error) {
      // Only the bearer expiring is worth a fresh mint; a 401 about the
      // customer key ("Invalid Customer API Key", "Customer account not
      // found") means the X-Api-Key is wrong and a new token cannot help.
      if (
        !(error instanceof AuthenticationError) ||
        !error.message.startsWith("Access token expired")
      ) {
        throw error;
      }
      bearer.invalidate();
      return this.perform(request, await bearer.getToken(request.signal));
    }
  }

  private async perform<T>(
    request: HttpRequest,
    bearer: string | undefined,
  ): Promise<HttpResponse<T>> {
    const url = joinUrl(
      this.options.baseUrl,
      request.path,
      request.query ? buildQuery(request.query) : undefined,
    );
    parseUrl(url, request);
    const headers = this.buildHeaders(request, bearer);
    const body =
      request.body === undefined ? undefined : JSON.stringify(request.body);
    const maxRetries = request.retry === false ? 0 : this.options.maxRetries;
    const idempotent = isIdempotent(request.method);

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
