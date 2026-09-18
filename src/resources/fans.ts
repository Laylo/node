import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import { isoTimestamp } from "../core/time.js";
import type {
  Contact,
  SegmentCountResponse,
  SegmentFilters,
  SubscribeFanRequest,
  SubscribeFanResponse,
  SubscriptionCheckResponse,
  UnsubscriptionCheckResponse,
} from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

// `Omit` over a union erases the email/phone discriminant; mapping over each
// member keeps it.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * A fan to subscribe. Identical to the API's request body except
 * `consentGrantedAt` also accepts a `Date`, which is sent as its ISO 8601
 * string. Exactly one of `email` (with `emailMarketingConsent: true`) or
 * `phone` (with `smsMarketingConsent: true`) is given.
 * @see https://developers.laylo.com/api-reference/fans/fans.subscriptions.create
 */
export type SubscribeFanInput = DistributiveOmit<
  SubscribeFanRequest,
  "consentGrantedAt"
> & {
  /**
   * When the fan granted marketing consent: a `Date`, or an ISO 8601 string
   * with an explicit UTC offset. Recorded as the sign-up time; must not be in
   * the future.
   */
  consentGrantedAt: string | Date;
};

/**
 * Filters for counting the fans in a segment. Identical to the API's query
 * parameters except the sign-up bounds also accept a `Date`, which is sent as
 * its ISO 8601 string. Only `signUpType` is required.
 * @see https://developers.laylo.com/api-reference/fans/fans.segments.list
 */
export type CountFansInput = Omit<
  SegmentFilters,
  "signedUpAfter" | "signedUpBefore"
> & {
  /**
   * Only count fans who signed up at or after this time: a `Date`, or an ISO
   * 8601 string with an explicit UTC offset.
   */
  signedUpAfter?: string | Date;
  /**
   * Only count fans who signed up before this time (exclusive): a `Date`, or
   * an ISO 8601 string with an explicit UTC offset.
   */
  signedUpBefore?: string | Date;
};

// Enforced for JS callers; TS callers already get this from the union types.
const assertExactlyOneChannel = (contact: {
  email?: string | null | undefined;
  phone?: string | null | undefined;
}) => {
  const { email, phone } = contact ?? {};
  const hasEmail = email !== undefined && email !== null;
  const hasPhone = phone !== undefined && phone !== null;
  if (hasEmail === hasPhone) {
    throw new LayloConfigurationError(
      "A contact must carry exactly one of email or phone — pass { email } or { phone }, not both and not neither.",
    );
  }
};

// The API reads a location filter as JSON in the query string, one object per
// repeated key.
const encodeLocations = (locations: SegmentFilters["locations"]) =>
  locations?.map((location) => JSON.stringify(location));

const LIST_FILTERS = [
  "dropIds",
  "excludedDropIds",
  "conversionIds",
  "excludedConversionIds",
  "locations",
  "excludedLocations",
] as const;

// An empty array drops out of the query string entirely, which would widen the
// segment to every fan rather than narrow it to none.
const assertNoEmptyFilter = (filters: CountFansInput) => {
  for (const filter of LIST_FILTERS) {
    if (filters[filter]?.length === 0) {
      throw new LayloConfigurationError(
        `${filter} must contain at least one value; omit it to leave that filter off`,
      );
    }
  }
};

/**
 * Fan segment reads, exposed as `laylo.fans.segments`.
 * @see https://developers.laylo.com/api-reference/fans/fans.segments.list
 */
export class FanSegments extends APIResource {
  /**
   * Counts the customer's fans matching a set of filters, the way the
   * audience builder on the Laylo dashboard does. `signUpType` picks the
   * contact channel to count; the other filters narrow by drops purchased,
   * conversions, location, and sign-up time. Array filters match any of
   * their values, and must name at least one: an empty array is rejected
   * rather than counting the whole audience.
   * @param filters The segment's filters; `signUpType` is required.
   * @param options Per-call overrides.
   * @returns The number of matching fans.
   * @example
   * ```ts
   * const smsFans = await laylo.fans.segments.count({
   *   signUpType: "sms",
   *   dropIds: ["drop_123"],
   *   signedUpAfter: new Date("2026-01-01T00:00:00Z"),
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/fans/fans.segments.list
   */
  async count(
    filters: CountFansInput,
    options?: RequestOptions,
  ): Promise<number> {
    if (filters?.signUpType !== "sms" && filters?.signUpType !== "email") {
      throw new LayloConfigurationError(
        'signUpType is required and must be "sms" or "email"',
      );
    }
    assertNoEmptyFilter(filters);

    const { numberOfFans } = await this.request<SegmentCountResponse>(
      {
        method: "GET",
        path: "/v1/fans/segments",
        query: {
          signUpType: filters.signUpType,
          dropIds: filters.dropIds,
          excludedDropIds: filters.excludedDropIds,
          conversionIds: filters.conversionIds,
          excludedConversionIds: filters.excludedConversionIds,
          locations: encodeLocations(filters.locations),
          excludedLocations: encodeLocations(filters.excludedLocations),
          signedUpAfter: isoTimestamp(filters.signedUpAfter, "signedUpAfter"),
          signedUpBefore: isoTimestamp(
            filters.signedUpBefore,
            "signedUpBefore",
          ),
        },
      },
      options,
    );
    return numberOfFans;
  }
}

/**
 * Fan operations, exposed as `laylo.fans`: subscription checks, subscribing
 * a fan, and segment counts.
 * @see https://developers.laylo.com/guides/subscriptions
 */
export class Fans extends APIResource {
  /** Segments: `laylo.fans.segments.count()`. */
  readonly segments: FanSegments;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.segments = new FanSegments(context);
  }

  /**
   * Checks whether a contact currently subscribes to the customer. The contact
   * is exactly one of an email address or a phone number in E.164 format
   * (for example `+12025550100`).
   * @param contact The email or phone to check.
   * @param options Per-call overrides.
   * @returns Whether the contact currently follows the customer.
   * @example
   * ```ts
   * const isSubscribed = await laylo.fans.isSubscribed({ phone: "+12025550100" });
   * ```
   * @see https://developers.laylo.com/api-reference/fans/fans.subscribed.check
   * @see https://developers.laylo.com/guides/subscriptions
   */
  async isSubscribed(
    contact: Contact,
    options?: RequestOptions,
  ): Promise<boolean> {
    assertExactlyOneChannel(contact);
    const { isSubscribed } = await this.request<SubscriptionCheckResponse>(
      {
        method: "POST",
        path: "/v1/fans/subscribed",
        body: contact,
        idempotent: true,
      },
      options,
    );
    return isSubscribed;
  }

  /**
   * Checks whether a contact subscribed to the customer at some point and has
   * since unsubscribed. The contact is exactly one of an email address or a
   * phone number in E.164 format (for example `+12025550100`).
   * @param contact The email or phone to check.
   * @param options Per-call overrides.
   * @returns Whether the contact unsubscribed from the customer.
   * @example
   * ```ts
   * const isUnsubscribed = await laylo.fans.isUnsubscribed({ email: "fan@example.com" });
   * ```
   * @see https://developers.laylo.com/api-reference/fans/fans.unsubscribed.check
   * @see https://developers.laylo.com/guides/unsubscribes
   */
  async isUnsubscribed(
    contact: Contact,
    options?: RequestOptions,
  ): Promise<boolean> {
    assertExactlyOneChannel(contact);
    const { isUnsubscribed } = await this.request<UnsubscriptionCheckResponse>(
      {
        method: "POST",
        path: "/v1/fans/unsubscribed",
        body: contact,
        idempotent: true,
      },
      options,
    );
    return isUnsubscribed;
  }

  /**
   * Subscribes a fan to the customer, recording their marketing consent for
   * the channel given. The fan is exactly one of an email address with
   * `emailMarketingConsent: true` or an E.164 phone number with
   * `smsMarketingConsent: true`; `consentGrantedAt` is when they consented
   * and becomes their sign-up time. Pass `dropId` to also RSVP them to one of
   * the customer's drops; an unknown drop fails with `NotFoundError` and
   * writes nothing. Subscribing an already-subscribed fan only refreshes
   * their record, and clears any earlier unsubscribe.
   *
   * This is a write, so a `5xx` response is not retried automatically.
   * @param fan The contact, their consent, and optionally a drop to RSVP to.
   * @param options Per-call overrides.
   * @returns The fan's opaque id, the subscription state, and the RSVP when
   * a `dropId` was given.
   * @example
   * ```ts
   * const { fan, rsvp } = await laylo.fans.subscribe({
   *   email: "fan@example.com",
   *   emailMarketingConsent: true,
   *   consentGrantedAt: new Date(),
   *   dropId: "drop_123",
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/fans/fans.subscriptions.create
   * @see https://developers.laylo.com/guides/subscriptions
   */
  async subscribe(
    fan: SubscribeFanInput,
    options?: RequestOptions,
  ): Promise<SubscribeFanResponse> {
    assertExactlyOneChannel(fan);
    const consentGrantedAt = isoTimestamp(
      fan.consentGrantedAt,
      "consentGrantedAt",
    );
    return this.request<SubscribeFanResponse>(
      {
        method: "POST",
        path: "/v1/fans/subscriptions",
        body: { ...fan, consentGrantedAt },
      },
      options,
    );
  }
}
