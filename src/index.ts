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
