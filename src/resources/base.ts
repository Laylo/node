import type { TokenProvider } from "../core/auth.js";
import {
  assertCustomerAllowed,
  customerFrom,
  type Customer,
} from "../core/customer.js";
import { LayloConfigurationError } from "../core/errors.js";
import type { HttpClient, HttpMethod } from "../core/http.js";
import type { RequestOptions } from "../core/request-options.js";

/** Shared dependencies the client hands to every resource. */
export interface ResourceContext {
  /** Transport every call goes through. */
  http: HttpClient;
  /** Mints and refreshes the access token sent as the bearer. */
  tokens: TokenProvider | undefined;
  /**
   * Customer used when a call does not name its own: the `forCustomer`
   * scope's, else the one the client was constructed with.
   */
  customer?: Customer | undefined;
}

/** One endpoint call as a resource method describes it. */
export interface EndpointRequest {
  method: HttpMethod;
  /** Path starting with `/v1/`. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /**
   * Marks a POST or PATCH as safe to replay so transient failures are
   * retried like a GET. Only for reads that happen to use a write verb.
   */
  idempotent?: boolean;
  /**
   * Sent as the `Idempotency-Key` header and makes the call safe to retry.
   * `null` is treated as absent.
   */
  idempotencyKey?: string | null | undefined;
  integratorOnly?: boolean;
}

const IDEMPOTENCY_KEY = /^[\x20-\x7e]{1,255}$/;

// The API rejects anything else with a 400; a control character would make
// Headers throw a TypeError before the request is even sent.
const idempotencyKeyFrom = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw new LayloConfigurationError(
      "idempotencyKey must be 1 to 255 printable ASCII characters",
    );
  }
  return value;
};

/**
 * Base class every resource extends. Owns what all endpoints share: resolving
 * the customer for a call and attaching credentials before handing the
 * request to the transport.
 */
export abstract class APIResource {
  private readonly context: ResourceContext;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    this.context = context;
  }

  /**
   * Performs one endpoint call: resolves the customer (per-request over the
   * context's), attaches the bearer from the token provider when there is
   * one, and returns the parsed body.
   * @param endpoint The endpoint to call.
   * @param options Per-call overrides from the method's trailing argument.
   * @returns The parsed response body.
   */
  protected async request<T>(
    endpoint: EndpointRequest,
    options: RequestOptions = {},
  ): Promise<T> {
    const { tokens } = this.context;
    const idempotencyKey = idempotencyKeyFrom(endpoint.idempotencyKey);
    if (endpoint.integratorOnly === true && tokens === undefined) {
      throw new LayloConfigurationError(
        `${endpoint.method} ${endpoint.path} needs integrator credentials — a client constructed with only an apiKey can't call it. See https://developers.laylo.com/authentication`,
      );
    }
    const customer = customerFrom(options) ?? this.context.customer;
    if (customer === undefined) {
      throw new LayloConfigurationError(
        `${endpoint.method} ${endpoint.path} needs a customer — pass apiKey or creatorId in this call's options, scope a client with forCustomer(…), or set apiKey or creatorId when constructing the client.`,
      );
    }
    assertCustomerAllowed(customer, tokens !== undefined);

    const { data } = await this.context.http.request<T>({
      method: endpoint.method,
      path: endpoint.path,
      query: endpoint.query,
      body: endpoint.body,
      idempotent: endpoint.idempotent,
      idempotencyKey,
      auth: tokens === undefined ? customer : { bearer: tokens, ...customer },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      retry: options.retry,
    });
    return data;
  }
}
