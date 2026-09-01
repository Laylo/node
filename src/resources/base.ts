import type { TokenProvider } from "../core/auth.js";
import { LayloConfigurationError } from "../core/errors.js";
import type { HttpClient, HttpMethod } from "../core/http.js";
import type { RequestOptions } from "../core/request-options.js";

/** Shared dependencies the client hands to every resource. */
export interface ResourceContext {
  /** Transport every call goes through. */
  http: HttpClient;
  /** Mints and refreshes the access token sent as the bearer. */
  tokens: TokenProvider;
  /**
   * Customer API key used when a call does not carry its own: the
   * `forCustomer` scope's key, else the one the client was constructed with.
   */
  apiKey?: string;
}

/** One endpoint call as a resource method describes it. */
export interface EndpointRequest {
  method: HttpMethod;
  /** Path starting with `/v1/`. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * Base class every resource extends. Owns what all endpoints share: resolving
 * the customer key for a call and attaching credentials before handing the
 * request to the transport.
 */
export abstract class APIResource {
  private readonly context: ResourceContext;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer key.
   */
  constructor(context: ResourceContext) {
    this.context = context;
  }

  /**
   * Performs one endpoint call: resolves the customer key (per-request over
   * the context's), attaches the bearer from the token provider, and returns
   * the parsed body.
   * @param endpoint The endpoint to call.
   * @param options Per-call overrides from the method's trailing argument.
   * @returns The parsed response body.
   */
  protected async request<T>(
    endpoint: EndpointRequest,
    options: RequestOptions = {},
  ): Promise<T> {
    const apiKey = options.apiKey ?? this.context.apiKey;
    if (apiKey === undefined) {
      throw new LayloConfigurationError(
        `${endpoint.method} ${endpoint.path} needs a customer API key — pass apiKey in this call's options, scope a client with forCustomer(apiKey), or set apiKey when constructing the client.`,
      );
    }

    const { data } = await this.context.http.request<T>({
      method: endpoint.method,
      path: endpoint.path,
      ...(endpoint.query === undefined ? {} : { query: endpoint.query }),
      ...(endpoint.body === undefined ? {} : { body: endpoint.body }),
      auth: { bearer: this.context.tokens, apiKey },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      ...(options.retry === undefined ? {} : { retry: options.retry }),
    });
    return data;
  }
}
