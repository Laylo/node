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
  ConversionCounts,
  ConversionEvents,
  Conversions,
  ListConversionCountsInput,
  ListConversionsInput,
  TrackConversionEventInput,
} from "./resources/conversions.js";
export type { Customers } from "./resources/customers.js";
export type { Drops } from "./resources/drops.js";
export type {
  CountFansInput,
  Fans,
  FanSegments,
  SubscribeFanInput,
} from "./resources/fans.js";
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
  ConversionCount,
  ConversionCountBucket,
  ConversionCountsReport,
  ConversionSubject,
  CustomerAccount,
  Drop,
  ListConversionCountsParams,
  ListConversionsParams,
  SegmentCountResponse,
  SegmentFilters,
  SegmentLocation,
  SubscribeFanRequest,
  SubscribeFanResponse,
  SubscriptionCheckResponse,
  TokenResponse,
  TrackConversionRequest,
  TrackConversionResponse,
  TrackedConversion,
  UnsubscriptionCheckResponse,
  VerifyKeyResponse,
} from "./types.js";

export default Laylo;
