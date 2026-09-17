import type { operations } from "./generated/openapi.js";

type JsonOf<Payload> = Payload extends {
  content: { "application/json": infer Body };
}
  ? Body
  : never;

type SuccessJson<Operation> = Operation extends {
  responses: { 200: infer Response };
}
  ? JsonOf<Response>
  : never;

type RequestJson<Operation> = Operation extends { requestBody?: infer Body }
  ? JsonOf<NonNullable<Body>>
  : never;

/**
 * A drop with its lifecycle state and RSVP count. Timestamps are Unix epoch
 * milliseconds.
 * @see https://developers.laylo.com/records/drop
 */
export type Drop = SuccessJson<operations["drops.list"]>[number];

/**
 * A conversion a fan can execute on a customer's account, identified by an
 * action and name.
 * @see https://developers.laylo.com/records/conversion
 */
export type Conversion = SuccessJson<operations["conversions.list"]>[number];

/**
 * The action a conversion represents, as a string literal union.
 * @see https://developers.laylo.com/records/conversion-action
 */
export type ConversionAction = Conversion["action"];

/**
 * A conversion event as acknowledged by the track endpoint.
 * @see https://developers.laylo.com/records/tracked-conversion
 */
export type TrackedConversion = SuccessJson<
  operations["conversions.track"]
>["tracked"];

/**
 * The contact details a tracked conversion was attributed to.
 * @see https://developers.laylo.com/records/conversion-subject
 */
export type ConversionSubject = TrackedConversion["user"];

/**
 * A single contact channel: exactly one of an email address or an E.164
 * phone number.
 * @see https://developers.laylo.com/api-reference/fans/fans.subscribed.check
 */
export type Contact = RequestJson<operations["fans.subscribed.check"]>;

/**
 * Request body for tracking a conversion event.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.track
 */
export type TrackConversionRequest = RequestJson<
  operations["conversions.track"]
>;

/**
 * Query parameters accepted when listing conversions.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.list
 */
export type ListConversionsParams = NonNullable<
  operations["conversions.list"]["parameters"]["query"]
>;

/**
 * Response confirming the customer resolved: `apiKeyStatus` is `"valid"` when
 * a key was checked, or `"not_provided"` for a customer named by `creatorId`.
 * @see https://developers.laylo.com/api-reference/users/keys.verify
 */
export type VerifyKeyResponse = SuccessJson<operations["keys.verify"]>;

/**
 * Response carrying a bearer token minted from an API key.
 * @see https://developers.laylo.com/api-reference/auth/auth.token.create
 */
export type TokenResponse = SuccessJson<operations["auth.token.create"]>;

/**
 * Response acknowledging a tracked conversion event.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.track
 */
export type TrackConversionResponse = SuccessJson<
  operations["conversions.track"]
>;

/**
 * Response reporting whether a contact currently subscribes to the customer.
 * @see https://developers.laylo.com/api-reference/fans/fans.subscribed.check
 */
export type SubscriptionCheckResponse = SuccessJson<
  operations["fans.subscribed.check"]
>;

/**
 * Response reporting whether a contact unsubscribed from the customer.
 * @see https://developers.laylo.com/api-reference/fans/fans.unsubscribed.check
 */
export type UnsubscriptionCheckResponse = SuccessJson<
  operations["fans.unsubscribed.check"]
>;
