import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import type {
  Contact,
  SubscriptionCheckResponse,
  UnsubscriptionCheckResponse,
} from "../types.js";
import { APIResource } from "./base.js";

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
 * Fan subscription checks, exposed as `laylo.fans`.
 * @see https://developers.laylo.com/guides/subscriptions
 */
export class Fans extends APIResource {
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
