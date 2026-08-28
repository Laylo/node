import { parseRetryAfter } from "./retry.js";

const KINDS = Symbol.for("laylo.node.errorKinds");

const MAX_BODY_IN_MESSAGE = 200;

const hasKind = (value: unknown, kind: string): boolean =>
  typeof value === "object" &&
  value !== null &&
  KINDS in value &&
  Array.isArray((value as Record<symbol, unknown>)[KINDS]) &&
  ((value as Record<symbol, unknown>)[KINDS] as unknown[]).includes(kind);

/**
 * Base class for every error thrown by the SDK. Catch this to handle anything
 * Laylo-related in one place, or narrow to a subclass for specific handling.
 * @see https://developers.laylo.com/errors
 */
export class LayloError extends Error {
  /**
   * @param message Human-readable description of the failure.
   * @param options Standard `ErrorOptions`; set `cause` to keep the original error.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;

    // A consumer may load the ESM build and a dependency the CJS build. Those
    // are two copies of every class, so a plain prototype check would fail
    // across them. Record the class chain by name and let instanceof match on
    // it as a fallback.
    const kinds: string[] = [];
    let ctor: unknown = new.target;
    while (typeof ctor === "function" && ctor !== Error) {
      kinds.push((ctor as { name: string }).name);
      ctor = Object.getPrototypeOf(ctor);
    }
    Object.defineProperty(this, KINDS, { value: kinds, enumerable: false });
  }

  /**
   * @param value The value being tested with `instanceof`.
   * @returns Whether `value` is an instance of this class, from either build.
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, value) === true ||
      hasKind(value, this.name)
    );
  }
}

/**
 * Fields carried by every error the API responds with.
 * @see https://developers.laylo.com/errors
 */
export interface LayloAPIErrorOptions {
  /** HTTP status code of the response. */
  status: number;
  /** Machine-readable error code from the response body, or `UNKNOWN`. */
  code: string;
  /** Human-readable description of what went wrong. */
  message: string;
  /** Extra context the API attached to the error, if any. */
  details?: unknown;
  /** Request identifier from the `x-amzn-requestid` or `x-request-id` header. */
  requestId?: string;
  /** Response headers, useful for rate-limit and request-id inspection. */
  headers: Headers;
  /** The parsed response body (JSON when possible, otherwise text). */
  raw: unknown;
}

const envelope = (
  body: unknown,
):
  | {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      apiKeyStatus?: unknown;
    }
  | undefined => {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = body.error;
  return typeof error === "object" && error !== null ? error : undefined;
};

const messageFor = (status: number, body: unknown, code: unknown): string => {
  const err = envelope(body);
  if (err && typeof err.message === "string" && err.message.length > 0) {
    return err.message;
  }
  if (typeof body === "string" && body.trim().length > 0) {
    const text = body.trim().replace(/\s+/g, " ");
    return text.length > MAX_BODY_IN_MESSAGE
      ? `${text.slice(0, MAX_BODY_IN_MESSAGE)}…`
      : text;
  }
  return typeof code === "string" && code !== "UNKNOWN"
    ? `Request failed with status ${status} (${code})`
    : `Request failed with status ${status}`;
};

/**
 * Thrown when the API responds with a non-2xx status. The SDK picks the most
 * specific subclass it can from the status code, so you can branch on
 * `instanceof` or on `status`/`code` as you prefer.
 * @see https://developers.laylo.com/errors
 */
export class LayloAPIError extends LayloError {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;
  readonly headers: Headers;
  readonly raw: unknown;

  /**
   * @param options The fields describing the failed response.
   */
  constructor(options: LayloAPIErrorOptions) {
    super(options.message);
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.headers = options.headers;
    this.raw = options.raw;
  }

  /**
   * Builds the right error subclass for a failed response.
   * @param response The failed `Response`.
   * @param body The response body, already parsed as JSON where possible.
   * @returns A `LayloAPIError` (or subclass) describing the failure.
   */
  static fromResponse(response: Response, body: unknown): LayloAPIError {
    const err = envelope(body);
    const code =
      err && typeof err.code === "string" && err.code.length > 0
        ? err.code
        : "UNKNOWN";
    const options: LayloAPIErrorOptions = {
      status: response.status,
      code,
      message: messageFor(response.status, body, code),
      headers: response.headers,
      raw: body,
    };
    if (err?.details !== undefined) {
      options.details = err.details;
    }
    const requestId =
      response.headers.get("x-amzn-requestid") ??
      response.headers.get("x-request-id");
    if (requestId !== null) {
      options.requestId = requestId;
    }

    switch (response.status) {
      case 400:
        return new BadRequestError(options);
      case 401: {
        const status = err?.apiKeyStatus;
        return new AuthenticationError(
          status === "invalid" ? { ...options, apiKeyStatus: status } : options,
        );
      }
      case 403:
        return new PermissionError(options);
      case 404:
        return new NotFoundError(options);
      case 405:
        return new MethodNotAllowedError(options);
      case 409:
        return new ConflictError(options);
      case 429: {
        const details = err?.details;
        const fromBody =
          typeof details === "object" &&
          details !== null &&
          typeof (details as { retryAfter?: unknown }).retryAfter === "number"
            ? (details as { retryAfter: number }).retryAfter
            : undefined;
        const retryAfter =
          parseRetryAfter(response.headers.get("retry-after")) ?? fromBody;
        return new RateLimitError(
          retryAfter === undefined ? options : { ...options, retryAfter },
        );
      }
      case 501:
        return new NotImplementedError(options);
      default:
        return response.status >= 500
          ? new ServerError(options)
          : new LayloAPIError(options);
    }
  }
}

/**
 * 400 — the request was malformed or failed validation. Check `details`.
 * @see https://developers.laylo.com/errors
 */
export class BadRequestError extends LayloAPIError {}

/**
 * 401 — the credentials are missing, expired, or invalid.
 * @see https://developers.laylo.com/errors
 */
export class AuthenticationError extends LayloAPIError {
  /** Set to `"invalid"` when the API rejected the API key itself. */
  readonly apiKeyStatus: "invalid" | undefined;

  /**
   * @param options The failed-response fields plus `apiKeyStatus` when known.
   */
  constructor(options: LayloAPIErrorOptions & { apiKeyStatus?: "invalid" }) {
    super(options);
    this.apiKeyStatus = options.apiKeyStatus;
  }
}

/**
 * 403 — authenticated, but not allowed to perform this operation.
 * @see https://developers.laylo.com/errors
 */
export class PermissionError extends LayloAPIError {}

/**
 * 404 — the resource does not exist or is not visible to this account.
 * @see https://developers.laylo.com/errors
 */
export class NotFoundError extends LayloAPIError {}

/**
 * 405 — the HTTP method is not supported on this route.
 * @see https://developers.laylo.com/errors
 */
export class MethodNotAllowedError extends LayloAPIError {}

/**
 * 409 — the request conflicts with the current state of the resource.
 * @see https://developers.laylo.com/errors
 */
export class ConflictError extends LayloAPIError {}

/**
 * 429 — too many requests. The SDK retries these automatically; if you still
 * see one, wait `retryAfter` seconds before trying again.
 * @see https://developers.laylo.com/errors
 */
export class RateLimitError extends LayloAPIError {
  /** Seconds to wait before retrying, when the API said. */
  readonly retryAfter: number | undefined;

  /**
   * @param options The failed-response fields plus `retryAfter` when known.
   */
  constructor(options: LayloAPIErrorOptions & { retryAfter?: number }) {
    super(options);
    this.retryAfter = options.retryAfter;
  }
}

/**
 * 501 — the endpoint exists but is not available yet.
 * @see https://developers.laylo.com/errors
 */
export class NotImplementedError extends LayloAPIError {}

/**
 * 5xx — something went wrong on Laylo's side. The SDK retries these
 * automatically before giving up.
 * @see https://developers.laylo.com/errors
 */
export class ServerError extends LayloAPIError {}

/**
 * The request never got a response: DNS failure, connection refused, TLS
 * problems, or the socket dropping mid-flight. The underlying error is on
 * `cause`.
 * @see https://developers.laylo.com/errors
 */
export class LayloConnectionError extends LayloError {}

/**
 * The request exceeded the configured timeout and was aborted by the SDK.
 * @see https://developers.laylo.com/errors
 */
export class LayloTimeoutError extends LayloError {}

/**
 * The client was misconfigured — for example a missing API key or a parameter
 * the API cannot accept. These are thrown before any request is made.
 * @see https://developers.laylo.com/errors
 */
export class LayloConfigurationError extends LayloError {}
