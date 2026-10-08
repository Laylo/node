import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import { isoSignUpBounds, type WithDateSignUpBounds } from "../core/time.js";
import type {
  MessageSegment,
  ScheduleSegmentMessageRequest,
  SegmentMessage,
  SendSegmentMessageRequest,
  SendSmsRequest,
  SendSmsResponse,
} from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

const MAX_SMS_RECIPIENTS = 200;

const isGiven = (value: unknown) => value !== undefined && value !== null;

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
 * The fans a segment message goes to. Identical to the API's `segment` except
 * the sign-up bounds also accept a `Date`, which is sent as its ISO 8601
 * string. `signUpType` must be `"sms"`, and only one of `signedUpAfter` and
 * `signedUpBefore` can be given.
 * @see https://developers.laylo.com/guides/segment-messages
 */
export type MessageSegmentInput = WithDateSignUpBounds<MessageSegment>;

/**
 * A message to send to a fan segment now.
 * @see https://developers.laylo.com/api-reference/messages/messages.segments.send
 */
export type SendSegmentMessageInput = Omit<
  SendSegmentMessageRequest,
  "segment"
> & {
  /** The fans to message. */
  segment: MessageSegmentInput;
};

/**
 * A message to send to a fan segment at a scheduled time.
 * @see https://developers.laylo.com/api-reference/messages/messages.segments.schedule
 */
export type ScheduleSegmentMessageInput = Omit<
  ScheduleSegmentMessageRequest,
  "segment"
> & {
  /** The fans to message. */
  segment: MessageSegmentInput;
};

/**
 * Per-call overrides for a segment message, adding an idempotency key to the
 * usual {@link RequestOptions}.
 */
export interface SegmentMessageOptions extends RequestOptions {
  /**
   * Makes the call safe to retry, sent as the `Idempotency-Key` header: 1 to
   * 255 printable ASCII characters, unique to this message. A repeat with the
   * same key and body within 24 hours returns the first response instead of
   * creating another message, so with a key the SDK retries a `5xx`, a
   * dropped connection, and a `409` from an earlier attempt that hasn't
   * finished yet. A `ConflictError` after those retries means that attempt
   * is still running and the message may well be created: call again later
   * with the same key to get its response. A timeout is never retried
   * automatically; retry it yourself with the same key. The same key with a
   * different body throws a `LayloAPIError` with status `422`.
   */
  idempotencyKey?: string | null;
}

/**
 * Messages to a fan segment, exposed as `laylo.messages.segments`.
 * @see https://developers.laylo.com/guides/segment-messages
 */
export class SegmentMessages extends APIResource {
  /**
   * Texts `message` to every fan in `segment` within the next few minutes.
   * The segment takes the same filters as `laylo.fans.segments.count()`, so
   * count first to see roughly how many fans it reaches. Recipients are
   * worked out when the message sends, and only fans currently subscribed by
   * SMS are texted. `timezone` is the IANA zone the message is written in,
   * used to read a time it mentions, like "tomorrow at 2pm".
   *
   * This is a write, so a `5xx` response is not retried automatically unless
   * you pass an `idempotencyKey`.
   * @param input The message, the segment to send it to, and its time zone.
   * @param options Per-call overrides, including an optional idempotency key.
   * @returns The created message, with the UTC time it will send.
   * @example
   * ```ts
   * const { id, sendAt } = await laylo.messages.segments.send(
   *   {
   *     message: "Presale starts now: https://laylo.com/example",
   *     segment: { signUpType: "sms", dropIds: ["drop_123"] },
   *     timezone: "America/New_York",
   *   },
   *   { idempotencyKey: "presale-2026-11-20" },
   * );
   * ```
   * @see https://developers.laylo.com/api-reference/messages/messages.segments.send
   * @see https://developers.laylo.com/guides/segment-messages
   */
  async send(
    input: SendSegmentMessageInput,
    options?: SegmentMessageOptions,
  ): Promise<SegmentMessage> {
    return this.create("/v1/messages/segments", input, options);
  }

  /**
   * Schedules `message` for every fan in `segment` at `sendAt`, the local
   * date and time in `timezone` with no offset, like `"2026-11-20T19:00"`.
   * It must be at least 5 minutes and at most 2 years away, and is rounded up
   * to the next five-minute mark. Daylight saving is applied for that date:
   * a time skipped when clocks spring forward is rejected, and a repeated
   * one uses the first occurrence. Recipients are worked out when the
   * message sends, not now.
   *
   * This is a write, so a `5xx` response is not retried automatically unless
   * you pass an `idempotencyKey`.
   * @param input The message, the segment, and when to send it.
   * @param options Per-call overrides, including an optional idempotency key.
   * @returns The created message, with the UTC time it will send.
   * @example
   * ```ts
   * const { sendAt } = await laylo.messages.segments.schedule({
   *   message: "Tickets go on sale tomorrow: https://laylo.com/example",
   *   segment: { signUpType: "sms" },
   *   sendAt: "2026-11-20T19:00",
   *   timezone: "America/New_York",
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/messages/messages.segments.schedule
   * @see https://developers.laylo.com/guides/segment-messages
   */
  async schedule(
    input: ScheduleSegmentMessageInput,
    options?: SegmentMessageOptions,
  ): Promise<SegmentMessage> {
    return this.create("/v1/messages/segments/scheduled", input, options);
  }

  private async create(
    path: string,
    input: SendSegmentMessageInput | ScheduleSegmentMessageInput,
    options: SegmentMessageOptions = {},
  ): Promise<SegmentMessage> {
    const segment = input?.segment;
    if (segment?.signUpType !== "sms") {
      throw new LayloConfigurationError(
        'segment.signUpType must be "sms": only SMS segments can be messaged',
      );
    }
    // A count takes both bounds, but the API refuses them together on a send.
    if (isGiven(segment.signedUpAfter) && isGiven(segment.signedUpBefore)) {
      throw new LayloConfigurationError(
        "segment.signedUpAfter and segment.signedUpBefore can't be combined when messaging; pass one",
      );
    }

    return this.request<SegmentMessage>(
      {
        method: "POST",
        path,
        body: {
          ...input,
          segment: { ...segment, ...isoSignUpBounds(segment, "segment.") },
        },
        idempotencyKey: options.idempotencyKey,
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
   * Segment messages: `laylo.messages.segments.send()` and
   * `laylo.messages.segments.schedule()`.
   */
  readonly segments: SegmentMessages;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.sms = new SmsMessages(context);
    this.segments = new SegmentMessages(context);
  }
}
