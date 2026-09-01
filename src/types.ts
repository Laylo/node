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
 * One fan's conversions for a definition, pairing the fan with the merged
 * event.
 * @see https://developers.laylo.com/records/fan-conversion
 */
export type FanConversion = SuccessJson<
  operations["conversions.events.list"]
>["data"]["conversions"][number];

/**
 * A tracked conversion event, with repeated identical events merged into a
 * count.
 * @see https://developers.laylo.com/records/conversion-event
 */
export type ConversionEvent = FanConversion["event"];

/**
 * The fan summary returned inline on a conversion event.
 * @see https://developers.laylo.com/records/conversion-fan
 */
export type ConversionFan = FanConversion["fan"];

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
 * Cursor pagination metadata returned by list endpoints.
 * @see https://developers.laylo.com/records/cursor-page-info
 */
export type CursorPageInfo = SuccessJson<
  operations["drops.rsvps.list"]
>["page_info"];

/**
 * A fan's contact-safe profile as returned alongside RSVPs.
 * @see https://developers.laylo.com/records/fan
 */
export type Fan = SuccessJson<
  operations["drops.rsvps.list"]
>["data"]["rsvps"][number]["fan"];

/**
 * A single contact channel: exactly one of an email address or an E.164
 * phone number.
 * @see https://developers.laylo.com/api-reference/fans/fans.subscribed.check
 */
export type Contact = RequestJson<operations["fans.subscribed.check"]>;

/**
 * The audience filters that define a fan segment.
 * @see https://developers.laylo.com/api-reference/fans/fans.segments.search
 */
export type SegmentConfiguration = RequestJson<
  operations["fans.segments.search"]
>;

/**
 * A geographic filter used when segmenting fans.
 * @see https://developers.laylo.com/api-reference/fans/fans.segments.list
 */
export type Location = NonNullable<
  operations["fans.segments.list"]["parameters"]["query"]["locations"]
>[number];

/**
 * Request body for tracking a conversion event.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.track
 */
export type TrackConversionRequest = RequestJson<
  operations["conversions.track"]
>;

/**
 * Request body for creating a conversion definition.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.definition.create
 */
export type CreateConversionDefinitionRequest = RequestJson<
  operations["conversions.definition.create"]
>;

/**
 * Query parameters accepted when listing conversions.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.list
 */
export type ListConversionsParams = NonNullable<
  operations["conversions.list"]["parameters"]["query"]
>;

/**
 * Query parameters accepted when listing conversion events.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.events.list
 */
export type ListConversionEventsParams =
  operations["conversions.events.list"]["parameters"]["query"];

/**
 * Query parameters identifying the conversion definition to retrieve.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.definition.get
 */
export type RetrieveConversionDefinitionParams =
  operations["conversions.definition.get"]["parameters"]["query"];

/**
 * Response wrapping the requested conversion definition.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.definition.get
 */
export type RetrieveConversionDefinitionResponse = SuccessJson<
  operations["conversions.definition.get"]
>;

/**
 * Response confirming the presented API key is valid.
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
 * Response returning the newly created conversion definition.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.definition.create
 */
export type CreateConversionDefinitionResponse = SuccessJson<
  operations["conversions.definition.create"]
>;

/**
 * Response counting the fans that match a segment configuration.
 * @see https://developers.laylo.com/api-reference/fans/fans.segments.search
 */
export type SegmentCountResponse = SuccessJson<
  operations["fans.segments.search"]
>;
