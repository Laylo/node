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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

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
      const response = await this.send(url, request, headers, body);

      if (response instanceof Response) {
        if (response.ok) {
          return { data: (await parseBody(response)) as T, response };
        }
        if (attempt < maxRetries && isRetryableStatus(response.status)) {
          await sleep(
            backoffMs(
              attempt,
              parseRetryAfter(response.headers.get("retry-after")),
            ),
          );
          continue;
        }
        throw LayloAPIError.fromResponse(response, await parseBody(response));
      }

      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw response;
    }
  }

  private buildHeaders(request: HttpRequest): Headers {
    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": this.options.userAgent,
      ...request.headers,
    });
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

  // Resolves with the Response, or with a LayloConnectionError when the
  // network failed so the retry loop can treat both uniformly. Timeouts and
  // caller aborts are thrown straight through: neither is retried.
  private async send(
    url: string,
    request: HttpRequest,
    headers: Headers,
    body: string | undefined,
  ): Promise<Response | LayloConnectionError> {
    const timeout = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs;
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([timeout.signal, request.signal])
      : timeout.signal;

    try {
      return await this.options.fetch(url, {
        method: request.method,
        headers,
        signal,
        ...(body === undefined ? {} : { body }),
      });
    } catch (error) {
      if (timeout.signal.aborted) {
        throw new LayloTimeoutError(
          `Request to ${request.method} ${request.path} timed out after ${timeoutMs}ms`,
          { cause: error },
        );
      }
      if (request.signal?.aborted) {
        throw error;
      }
      return new LayloConnectionError(
        `Request to ${request.method} ${request.path} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
