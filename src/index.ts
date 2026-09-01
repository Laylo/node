import { Laylo } from "./client.js";

export { Laylo } from "./client.js";
export type { ClientOptions } from "./client.js";
export {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "./client.js";
export type { Auth } from "./resources/auth.js";
export type {
  ConversionDefinitions,
  ConversionEvents,
  Conversions,
  ListConversionsInput,
  TrackConversionEventInput,
} from "./resources/conversions.js";
export type { Drops } from "./resources/drops.js";
export type { FanSegments, Fans } from "./resources/fans.js";
export type { Keys } from "./resources/keys.js";
export type { Messages, ScheduledMessages } from "./resources/messages.js";
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
export type {
  FetchPage,
  Page,
  PageInfo,
  PageResponse,
} from "./core/pagination.js";
export type { RequestOptions } from "./core/request-options.js";
export type {
  Contact,
  Conversion,
  ConversionAction,
  ConversionEvent,
  ConversionFan,
  ConversionSubject,
  CreateConversionDefinitionRequest,
  CreateConversionDefinitionResponse,
  CursorPageInfo,
  Drop,
  Fan,
  FanConversion,
  ListConversionEventsParams,
  ListConversionsParams,
  Location,
  RetrieveConversionDefinitionParams,
  RetrieveConversionDefinitionResponse,
  SegmentConfiguration,
  SegmentCountResponse,
  SubscriptionCheckResponse,
  TokenResponse,
  TrackConversionRequest,
  TrackConversionResponse,
  TrackedConversion,
  UnsubscriptionCheckResponse,
  VerifyKeyResponse,
} from "./types.js";

export default Laylo;
