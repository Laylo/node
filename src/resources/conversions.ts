import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import { isoTimestamp } from "../core/time.js";
import type {
  Conversion,
  ConversionAction,
  ConversionCountsReport,
  ListConversionCountsParams,
  ListConversionsParams,
  TrackConversionRequest,
  TrackConversionResponse,
} from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

/**
 * Filters accepted when listing conversion definitions. `action` takes a
 * single value or an array; an array matches any of the given actions.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.list
 */
export type ListConversionsInput = Omit<ListConversionsParams, "action"> & {
  /** Only return conversions with one of these actions. */
  action?: ConversionAction | ConversionAction[];
};

/**
 * Filters accepted when listing conversion counts. `action` takes a single
 * value or an array; an array matches any of the given actions. The window
 * bounds accept a `Date` as well as an ISO 8601 string.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.counts.list
 */
export type ListConversionCountsInput = Omit<
  ListConversionCountsParams,
  "action" | "startDate" | "endDate"
> & {
  /** Only count events with one of these actions. */
  action?: ConversionAction | ConversionAction[];
  /**
   * Start of the window, inclusive: a `Date`, or an ISO 8601 string with an
   * explicit UTC offset. Defaults to 28 days before `endDate`.
   */
  startDate?: string | Date;
  /**
   * End of the window, inclusive: a `Date`, or an ISO 8601 string with an
   * explicit UTC offset. Defaults to now.
   */
  endDate?: string | Date;
};

const assertSomeAction = (action: ConversionAction[]) => {
  if (action.length === 0) {
    throw new LayloConfigurationError(
      "action must contain at least one value; omit it to include every action",
    );
  }
};

/**
 * A conversion event to track. Identical to the API's request body except
 * `timestamp` also accepts a `Date`, which is sent as its ISO 8601 string.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.track
 */
export type TrackConversionEventInput = Omit<
  TrackConversionRequest,
  "timestamp"
> & {
  /**
   * When the event occurred: a `Date`, or an ISO 8601 string with an explicit
   * UTC offset.
   */
  timestamp: string | Date;
};

/**
 * Conversion event operations, exposed as `laylo.conversions.events`.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.track
 */
export class ConversionEvents extends APIResource {
  /**
   * Tracks a conversion event for a fan. Repeated events with the same
   * `metadata.uniqueId` are merged, making it safe to retry. Contact details
   * in `user` are not echoed back: the response's subject carries `hasEmail`
   * and `hasPhone` flags instead.
   *
   * The returned `status` is `"failure"` when the event was rejected without
   * an HTTP error, so check it rather than relying on the call resolving.
   * @param event The event to track.
   * @param options Per-call overrides.
   * @returns The acceptance status and the accepted event.
   * @example
   * ```ts
   * const { status, tracked } = await laylo.conversions.events.track({
   *   action: "TICKET_PURCHASE",
   *   name: "VIP ticket",
   *   timestamp: new Date(),
   *   metadata: { uniqueId: order.id, currency: "USD", totalPrice: 59.5 },
   *   user: { email: order.email, emailMarketingConsent: true },
   * });
   * if (status === "failure") {
   *   // queue the event for a retry
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/conversions/conversions.track
   */
  async track(
    event: TrackConversionEventInput,
    options?: RequestOptions,
  ): Promise<TrackConversionResponse> {
    const timestamp = isoTimestamp(event.timestamp, "timestamp");
    return this.request<TrackConversionResponse>(
      {
        method: "POST",
        path: "/v1/conversions/events",
        body: { ...event, timestamp },
      },
      options,
    );
  }
}

/**
 * Conversion count reads, exposed as `laylo.conversions.counts`.
 * @see https://developers.laylo.com/api-reference/conversions/conversions.counts.list
 */
export class ConversionCounts extends APIResource {
  /**
   * Counts the customer's conversion events per action over a window,
   * mirroring the Fan Activity chart on the Laylo dashboard. Each entry
   * carries a total and a daily series covering the whole window, oldest
   * first, with days that follow the Pacific calendar. Actions with no events
   * in the window are omitted. The window defaults to the last 28 days.
   * @param params Optional action filter and window bounds.
   * @param options Per-call overrides.
   * @returns The applied window and one count per action with events in it.
   * @example
   * ```ts
   * const report = await laylo.conversions.counts.list({
   *   action: ["TICKET_PURCHASE", "RSVP"],
   *   startDate: new Date("2026-08-01T00:00:00Z"),
   *   endDate: new Date(),
   * });
   * for (const { action, total } of report.counts) {
   *   console.log(action, total);
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/conversions/conversions.counts.list
   */
  async list(
    params?: ListConversionCountsInput,
    options?: RequestOptions,
  ): Promise<ConversionCountsReport> {
    if (Array.isArray(params?.action)) {
      assertSomeAction(params.action);
    }

    return this.request<ConversionCountsReport>(
      {
        method: "GET",
        path: "/v1/conversions/counts",
        query: {
          action: params?.action,
          startDate: isoTimestamp(params?.startDate, "startDate"),
          endDate: isoTimestamp(params?.endDate, "endDate"),
        },
      },
      options,
    );
  }
}

/**
 * Conversion operations, exposed as `laylo.conversions`: read the customer's
 * conversion definitions, count events against them, and track new ones.
 * @see https://developers.laylo.com/guides/conversions
 */
export class Conversions extends APIResource {
  /** Events: `laylo.conversions.events.track()`. */
  readonly events: ConversionEvents;

  /** Counts: `laylo.conversions.counts.list()`. */
  readonly counts: ConversionCounts;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.events = new ConversionEvents(context);
    this.counts = new ConversionCounts(context);
  }

  /**
   * Lists the customer's conversion definitions, optionally filtered by
   * action and related product.
   * @param params Optional filters.
   * @param options Per-call overrides.
   * @returns The matching conversion definitions.
   * @example
   * ```ts
   * const purchases = await laylo.conversions.list({
   *   action: ["TICKET_PURCHASE", "STORE_PURCHASE"],
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/conversions/conversions.list
   */
  async list(
    params?: ListConversionsInput,
    options?: RequestOptions,
  ): Promise<Conversion[]> {
    if (Array.isArray(params?.action)) {
      assertSomeAction(params.action);
    }

    return this.request<Conversion[]>(
      {
        method: "GET",
        path: "/v1/conversions",
        query: {
          action: params?.action,
          relatedProductId: params?.relatedProductId,
        },
      },
      options,
    );
  }
}
