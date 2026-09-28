import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import type { SendSmsRequest, SendSmsResponse } from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

const MAX_SMS_RECIPIENTS = 200;

// The API refuses these too; checking here saves a round trip that would
// only come back as a 400.
const assertRecipientCount = (to: SendSmsRequest["to"]) => {
  if (!Array.isArray(to)) {
    return;
  }
  if (to.length === 0) {
    throw new LayloConfigurationError(
      "to must contain at least one phone number",
    );
  }
  if (to.length > MAX_SMS_RECIPIENTS) {
    throw new LayloConfigurationError(
      `to must contain at most ${String(MAX_SMS_RECIPIENTS)} phone numbers, received ${String(to.length)}`,
    );
  }
};

/**
 * SMS sends, exposed as `laylo.messages.sms`.
 * @see https://developers.laylo.com/api-reference/messages/messages.sms.send
 */
export class SmsMessages extends APIResource {
  /**
   * Texts `message` from the customer's Laylo number to `to`: one E.164
   * phone number, or an array of up to 200. Only numbers that currently
   * subscribe to the customer are texted; every other recipient comes back
   * in `skipped` by its index in `to`, with a reason of `"not_subscribed"`,
   * `"duplicate"`, or `"queue_failed"`. An invalid number rejects the whole
   * request with a `BadRequestError`, and nothing is sent.
   *
   * This is a write, so a `5xx` response is not retried automatically.
   * Retry the recipients skipped as `"queue_failed"` yourself.
   * @param sms The message text and its recipients.
   * @param options Per-call overrides.
   * @returns How many messages were queued, and the recipients skipped.
   * @example
   * ```ts
   * const to = ["+12025550100", "+12025550101"];
   * const { queued, skipped } = await laylo.messages.sms.send({
   *   message: "Presale starts now: https://laylo.com/example",
   *   to,
   * });
   * for (const { index, reason } of skipped) {
   *   console.log(to[index], reason);
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/messages/messages.sms.send
   * @see https://developers.laylo.com/guides/sms
   */
  async send(
    sms: SendSmsRequest,
    options?: RequestOptions,
  ): Promise<SendSmsResponse> {
    assertRecipientCount(sms?.to);
    return this.request<SendSmsResponse>(
      {
        method: "POST",
        path: "/v1/messages/sms",
        body: sms,
      },
      options,
    );
  }
}

/**
 * Messaging operations, exposed as `laylo.messages`.
 * @see https://developers.laylo.com/guides/sms
 */
export class Messages extends APIResource {
  /** SMS: `laylo.messages.sms.send()`. */
  readonly sms: SmsMessages;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.sms = new SmsMessages(context);
  }
}
