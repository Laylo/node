import type { RequestOptions } from "../core/request-options.js";
import type { Drop } from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

/**
 * Scheduled-message operations, exposed as `laylo.messages.scheduled`.
 * @see https://developers.laylo.com/api-reference/messages/messages.scheduled.list
 */
export class ScheduledMessages extends APIResource {
  /**
   * Lists the customer's drops whose drop-day message is still scheduled to go
   * out. `endDate` — when the message will be sent — and `createdAt` are Unix
   * epoch milliseconds, not ISO strings.
   * @param options Per-call overrides.
   * @returns The drops with a future scheduled message.
   * @example
   * ```ts
   * const scheduled = await laylo.messages.scheduled.list();
   * for (const drop of scheduled) {
   *   console.log(drop.title, drop.endDate === null ? null : new Date(drop.endDate));
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/messages/messages.scheduled.list
   */
  list(options?: RequestOptions): Promise<Drop[]> {
    return this.request<Drop[]>(
      { method: "GET", path: "/v1/messages/scheduled" },
      options,
    );
  }
}

/**
 * Messaging operations, exposed as `laylo.messages`. Grouped by kind so
 * future messaging surfaces can join without renames.
 */
export class Messages {
  /** Scheduled sends: `laylo.messages.scheduled.list()`. */
  readonly scheduled: ScheduledMessages;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    this.scheduled = new ScheduledMessages(context);
  }
}
