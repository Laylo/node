import type { RequestOptions } from "../core/request-options.js";
import type { Drop } from "../types.js";
import { APIResource } from "./base.js";

/**
 * Drop operations, exposed as `laylo.drops`.
 * @see https://developers.laylo.com/records/drop
 */
export class Drops extends APIResource {
  /**
   * Lists the customer's active public drops as a bare array. `createdAt` and
   * `endDate` are Unix epoch milliseconds, not ISO strings.
   * @param options Per-call overrides.
   * @returns The customer's active public drops.
   * @example
   * ```ts
   * const drops = await laylo.drops.list();
   * const nextDropDay = drops.find((drop) => drop.endDate !== null)?.endDate;
   * ```
   * @see https://developers.laylo.com/api-reference/drops/drops.list
   */
  list(options?: RequestOptions): Promise<Drop[]> {
    return this.request<Drop[]>({ method: "GET", path: "/v1/drops" }, options);
  }
}
