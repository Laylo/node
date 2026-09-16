import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import type {
  Contact,
  SegmentConfiguration,
  SegmentCountResponse,
  SubscriptionCheckResponse,
  UnsubscriptionCheckResponse,
} from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

// Enforced for JS callers; TS callers already get this from the Contact union.
const assertExactlyOneChannel = (contact: Contact) => {
  const { email, phone } = contact ?? {};
  const hasEmail = email !== undefined && email !== null;
  const hasPhone = phone !== undefined && phone !== null;
  if (hasEmail === hasPhone) {
    throw new LayloConfigurationError(
      "A contact must carry exactly one of email or phone — pass { email } or { phone }, not both and not neither.",
    );
  }
};

/**
 * Fan segment queries, exposed as `laylo.fans.segments`.
 * @see https://developers.laylo.com/guides/segments
 */
export class FanSegments extends APIResource {
  /**
   * Counts the fans matching a segment configuration, scoped to fans reachable
   * by `signUpType`. Each include filter (`dropIds`, `conversionIds`,
   * `locations`) includes fans matching any of its entries, and each
   * `excluded*` filter removes fans matching any of its entries.
   * @param configuration The audience filters defining the segment.
   * @param options Per-call overrides.
   * @returns How many fans match the segment.
   * @example
   * ```ts
   * // SMS fans who purchased drop A but not drop B
   * const numberOfFans = await laylo.fans.segments.count({
   *   signUpType: "sms",
   *   dropIds: ["drop_A"],
   *   excludedDropIds: ["drop_B"],
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/fans/fans.segments.search
   */
  async count(
    configuration: SegmentConfiguration,
    options?: RequestOptions,
  ): Promise<number> {
    const { numberOfFans } = await this.request<SegmentCountResponse>(
      {
        method: "POST",
        path: "/v1/fans/segments/search",
        body: configuration,
        idempotent: true,
      },
      options,
    );
    return numberOfFans;
  }
}

/**
 * Fan subscription checks and segment queries, exposed as `laylo.fans`.
 * @see https://developers.laylo.com/guides/subscriptions
 */
export class Fans extends APIResource {
  /** Segment queries: `laylo.fans.segments.count(configuration)`. */
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
}
