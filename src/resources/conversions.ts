import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import type {
  Conversion,
  ConversionAction,
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
    if (
      event.timestamp instanceof Date &&
      Number.isNaN(event.timestamp.getTime())
    ) {
      throw new LayloConfigurationError(
        "timestamp is an invalid Date; pass a valid Date or an ISO 8601 string",
      );
    }

    const timestamp =
      event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : event.timestamp;
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
 * Conversion operations, exposed as `laylo.conversions`: read the customer's
 * conversion definitions and track events against them.
 * @see https://developers.laylo.com/guides/conversions
 */
export class Conversions extends APIResource {
  /** Events: `laylo.conversions.events.track()`. */
  readonly events: ConversionEvents;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.events = new ConversionEvents(context);
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
    if (Array.isArray(params?.action) && params.action.length === 0) {
      throw new LayloConfigurationError(
        "action must contain at least one value; omit it to list every conversion",
      );
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
