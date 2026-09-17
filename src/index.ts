import { Laylo } from "./client.js";

export { Laylo } from "./client.js";
export type { ClientOptions } from "./client.js";
export type { Customer } from "./core/customer.js";
export {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "./client.js";
export type { Auth } from "./resources/auth.js";
export type {
  ConversionEvents,
  Conversions,
  ListConversionsInput,
  TrackConversionEventInput,
} from "./resources/conversions.js";
export type { Drops } from "./resources/drops.js";
export type { Fans } from "./resources/fans.js";
export type { Keys } from "./resources/keys.js";
export {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  LayloAPIError,
  LayloConfigurationError,
  LayloConnectionError,
  LayloError,
  LayloTimeoutError,
  MethodNotAllowedError,
  NotFoundError,
  NotImplementedError,
  PermissionError,
  RateLimitError,
  ServerError,
} from "./core/errors.js";
export type { LayloAPIErrorOptions } from "./core/errors.js";
export { VERSION } from "./version.js";
export type { RequestOptions } from "./core/request-options.js";
export type {
  Contact,
  Conversion,
  ConversionAction,
  ConversionSubject,
  Drop,
  ListConversionsParams,
  SubscriptionCheckResponse,
  TokenResponse,
  TrackConversionRequest,
  TrackConversionResponse,
  TrackedConversion,
  UnsubscriptionCheckResponse,
  VerifyKeyResponse,
} from "./types.js";

export default Laylo;
