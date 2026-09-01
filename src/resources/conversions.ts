import { LayloConfigurationError } from "../core/errors.js";
import {
  createPage,
  validateLimit,
  type Page,
  type PageResponse,
} from "../core/pagination.js";
import type { RequestOptions } from "../core/request-options.js";
import type {
  Conversion,
  ConversionAction,
  CreateConversionDefinitionRequest,
  CreateConversionDefinitionResponse,
  FanConversion,
  ListConversionEventsParams,
  ListConversionsParams,
  RetrieveConversionDefinitionParams,
  RetrieveConversionDefinitionResponse,
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
 * Conversion definition operations, exposed as `laylo.conversions.definitions`.
 * @see https://developers.laylo.com/records/conversion
 */
export class ConversionDefinitions extends APIResource {
  /**
   * Creates a conversion definition idempotently — creating the same
   * action/name pair again returns the existing definition.
   * @param definition The definition to create.
   * @param options Per-call overrides.
   * @returns The customer-scoped conversion definition.
   * @example
   * ```ts
   * const vipTicket = await laylo.conversions.definitions.create({
   *   action: "TICKET_PURCHASE",
   *   name: "VIP ticket",
   *   relatedProductId: "drop_123",
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/conversions/conversions.definition.create
   */
  async create(
    definition: CreateConversionDefinitionRequest,
    options?: RequestOptions,
  ): Promise<Conversion> {
    const { conversion } =
      await this.request<CreateConversionDefinitionResponse>(
        {
          method: "POST",
          path: "/v1/conversions/definitions",
          body: definition,
        },
        options,
      );
    return conversion;
  }

  /**
   * Retrieves one conversion definition by its exact action and name.
   * @param params The action and name identifying the definition.
   * @param options Per-call overrides.
   * @returns The matching conversion definition.
   * @example
   * ```ts
   * const vipTicket = await laylo.conversions.definitions.retrieve({
   *   action: "TICKET_PURCHASE",
   *   name: "VIP ticket",
   * });
   * ```
   * @see https://developers.laylo.com/api-reference/conversions/conversions.definition.get
   */
  async retrieve(
    params: RetrieveConversionDefinitionParams,
    options?: RequestOptions,
  ): Promise<Conversion> {
    const { conversion } =
      await this.request<RetrieveConversionDefinitionResponse>(
        {
          method: "GET",
          path: "/v1/conversions/definitions",
          query: { action: params.action, name: params.name },
        },
        options,
      );
    return conversion;
  }
}

/**
 * Conversion event operations, exposed as `laylo.conversions.events`.
 * @see https://developers.laylo.com/records/fan-conversion
 */
export class ConversionEvents extends APIResource {
  /**
   * Lists the tracked events for one conversion definition, one fan-event
   * pair per item. Iterate the returned page with `for await` to walk every
   * event lazily.
   * @param params The definition's action and name, plus paging controls.
   * @param options Per-call overrides, carried to subsequent pages.
   * @returns The first page of events.
   * @example
   * ```ts
   * const events = await laylo.conversions.events.list({
   *   action: "TICKET_PURCHASE",
   *   name: "VIP ticket",
   *   limit: 100,
   * });
   * for await (const { fan, event } of events) {
   *   console.log(fan.id, event.count, new Date(event.createdAt));
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/conversions/conversions.events.list
   */
  async list(
    params: ListConversionEventsParams,
    options?: RequestOptions,
  ): Promise<Page<FanConversion>> {
    validateLimit(params?.limit);

    const fetchEvents = (
      cursor: string | undefined,
      callOptions: RequestOptions | undefined,
    ) =>
      this.request<PageResponse<FanConversion, "conversions">>(
        {
          method: "GET",
          path: "/v1/conversions/events",
          query: {
            action: params?.action,
            name: params?.name,
            limit: params?.limit,
            cursor: cursor ?? params?.cursor,
          },
        },
        callOptions,
      );

    return createPage(
      await fetchEvents(undefined, options),
      "conversions",
      fetchEvents,
      options,
    );
  }

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
 * Conversion operations, exposed as `laylo.conversions`: define what counts
 * as a conversion, track events against it, and read them back.
 * @see https://developers.laylo.com/guides/conversions
 */
export class Conversions extends APIResource {
  /** Definitions: `laylo.conversions.definitions.create()` / `.retrieve()`. */
  readonly definitions: ConversionDefinitions;
  /** Events: `laylo.conversions.events.list()` / `.track()`. */
  readonly events: ConversionEvents;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer key.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.definitions = new ConversionDefinitions(context);
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
