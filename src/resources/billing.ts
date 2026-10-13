import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import type {
  CreditUsageByProductReport,
  CreditUsageReport,
  GetCreditUsageParams,
  GetProductCreditUsageParams,
} from "../types.js";
import { APIResource, type ResourceContext } from "./base.js";

/**
 * The drops and segment messages to sum credit usage for, with the same
 * window and bucketing as {@link GetCreditUsageParams}. Identical to the
 * API's query parameters except the repeated `productId` is passed as a
 * `productIds` array.
 * @see https://developers.laylo.com/api-reference/billing/billing.usage.products.get
 */
export type GetProductCreditUsageInput = Omit<
  GetProductCreditUsageParams,
  "productId"
> & {
  /**
   * Drop and segment message ids, 1 to 50 distinct, each belonging to the
   * customer. Repeats are sent once.
   */
  productIds: readonly string[];
};

/**
 * Message credit usage reads, exposed as `laylo.billing.creditUsage`.
 * @see https://developers.laylo.com/guides/credit-usage
 */
export class BillingCreditUsage extends APIResource {
  /**
   * Gets the message credits the customer used over a window of UTC days,
   * per channel, with a series that has a bucket for every day, week, or
   * month in the window, empty ones included. Credits are priced at the
   * customer's current `rates`, not the rates when each message went out. It
   * is usage, not an invoice: prepaid and free credits aren't applied.
   * @param params Optional window and interval.
   * @param options Per-call overrides.
   * @returns The applied window, the rates, the series, and the total.
   * @example
   * ```ts
   * const usage = await laylo.billing.creditUsage.get({
   *   startDate: "2026-09-01",
   *   endDate: "2026-09-30",
   *   interval: "week",
   * });
   * console.log(usage.total.credits, usage.total.costUsd);
   * ```
   * @see https://developers.laylo.com/api-reference/billing/billing.usage.get
   */
  async get(
    params?: GetCreditUsageParams,
    options?: RequestOptions,
  ): Promise<CreditUsageReport> {
    return this.request<CreditUsageReport>(
      {
        method: "GET",
        path: "/v1/billing/credit-usage",
        query: {
          startDate: params?.startDate,
          endDate: params?.endDate,
          interval: params?.interval,
        },
      },
      options,
    );
  }

  /**
   * Gets the same report for specific drops and segment messages, summed
   * together into one. A drop includes its sub-drops, and a product named
   * twice counts once; call once per product for a per-product breakdown.
   * The API answers 404 when any product doesn't belong to the customer, and
   * 400 when the drops expand to more than 200 products with their
   * sub-drops.
   * @param params The products, plus an optional window and interval.
   * @param options Per-call overrides.
   * @returns The report, plus the de-duplicated `productIds` it summed.
   * @example
   * ```ts
   * const usage = await laylo.billing.creditUsage.getForProducts({
   *   productIds: ["drop_123", "message_456"],
   *   interval: "month",
   * });
   * console.log(usage.total.channels.domesticSms.credits);
   * ```
   * @see https://developers.laylo.com/api-reference/billing/billing.usage.products.get
   */
  async getForProducts(
    params: GetProductCreditUsageInput,
    options?: RequestOptions,
  ): Promise<CreditUsageByProductReport> {
    if (!Array.isArray(params?.productIds) || params.productIds.length === 0) {
      throw new LayloConfigurationError(
        "productIds must be an array of at least one drop or message id",
      );
    }

    const distinctProductIds = [...new Set(params.productIds)];

    return this.request<CreditUsageByProductReport>(
      {
        method: "GET",
        path: "/v1/billing/credit-usage/products",
        query: {
          productId: distinctProductIds,
          startDate: params.startDate,
          endDate: params.endDate,
          interval: params.interval,
        },
      },
      options,
    );
  }
}

/**
 * Billing reads, exposed as `laylo.billing`.
 * @see https://developers.laylo.com/guides/credit-usage
 */
export class Billing extends APIResource {
  /**
   * Credit usage: `laylo.billing.creditUsage.get()` and `.getForProducts()`.
   */
  readonly creditUsage: BillingCreditUsage;

  /**
   * @param context The client's shared transport, token provider, and default
   * customer.
   */
  constructor(context: ResourceContext) {
    super(context);
    this.creditUsage = new BillingCreditUsage(context);
  }
}
