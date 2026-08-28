import {
  LayloAPIError,
  LayloConnectionError,
  LayloTimeoutError,
} from "./errors.js";
import { buildQuery } from "./query.js";
import {
  backoffMs,
  DEFAULT_MAX_RETRIES,
  isRetryableStatus,
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

/** Credentials to attach to a single request. */
export interface RequestAuth {
  /** Access token sent as `Authorization: Bearer …`. */
  bearer?: string;
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
// PATCH is only retried when the request never got a response at all.
const isIdempotent = (method: HttpMethod) =>
  method !== "POST" && method !== "PATCH";

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

interface Attempt {
  response: Response;
  body: unknown;
}

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
   * body along with the raw response.
   * @param request The request to make.
   * @returns The parsed body and the underlying response.
   */
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const url = joinUrl(
      this.options.baseUrl,
      request.path,
      request.query ? buildQuery(request.query) : undefined,
    );
    const headers = this.buildHeaders(request);
    const body =
      request.body === undefined ? undefined : JSON.stringify(request.body);
    const maxRetries = request.retry === false ? 0 : this.options.maxRetries;

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.send(url, request, headers, body);
      const canRetry = attempt < maxRetries;

      if (outcome instanceof LayloConnectionError) {
        if (canRetry) {
          await this.wait(backoffMs(attempt), request.signal);
          continue;
        }
        throw outcome;
      }

      const { response } = outcome;
      if (response.ok) {
        return { data: outcome.body as T, response };
      }
      if (
        canRetry &&
        isIdempotent(request.method) &&
        isRetryableStatus(response.status)
      ) {
        await this.wait(
          backoffMs(
            attempt,
            parseRetryAfter(response.headers.get("retry-after")),
          ),
          request.signal,
        );
        continue;
      }
      throw LayloAPIError.fromResponse(response, outcome.body);
    }
  }

  private buildHeaders(request: HttpRequest): Headers {
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
    if (request.auth?.bearer !== undefined) {
      headers.set("Authorization", `Bearer ${request.auth.bearer}`);
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
  // with a LayloConnectionError, rather than throwing, when the network
  // failed so the retry loop can decide what to do. Timeouts and caller
  // aborts are thrown straight through: neither is retried.
  private async send(
    url: string,
    request: HttpRequest,
    headers: Headers,
    body: string | undefined,
  ): Promise<Attempt | LayloConnectionError> {
    const timeout = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs;
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([timeout.signal, request.signal])
      : timeout.signal;

    try {
      const response = await this.options.fetch(url, {
        method: request.method,
        headers,
        signal,
        ...(body === undefined ? {} : { body }),
      });
      return { response, body: await parseBody(response) };
    } catch (error) {
      if (timeout.signal.aborted) {
        throw new LayloTimeoutError(
          `Request to ${request.method} ${request.path} timed out after ${timeoutMs}ms`,
          { cause: error },
        );
      }
      if (request.signal?.aborted) {
        throw request.signal.reason;
      }
      return new LayloConnectionError(
        `Request to ${request.method} ${request.path} failed: ${describe(error)}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
