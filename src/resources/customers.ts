import type { RequestOptions } from "../core/request-options.js";
import type { CustomerAccount } from "../types.js";
import { APIResource } from "./base.js";

/**
 * Customer roster reads, exposed as `laylo.customers`.
 * @see https://developers.laylo.com/api-reference/users/customers.list
 */
export class Customers extends APIResource {
  /**
   * Lists the customer accounts under your integration's own Laylo account:
   * the roster `forCustomer({ creatorId })` can name an account from, with
   * each entry's `id` being the `creatorId` to pass. The list is scoped to
   * the integrator behind the access token, not to the customer the client
   * or call is otherwise acting as — but a customer must still be named, as
   * on every call. `createdAt` is Unix epoch milliseconds.
   * @param options Per-call overrides.
   * @returns The accounts on your roster, sorted by display name.
   * @example
   * ```ts
   * const customers = await laylo.customers.list();
   * for (const customer of customers) {
   *   const drops = await laylo
   *     .forCustomer({ creatorId: customer.id })
   *     .drops.list();
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/users/customers.list
   */
  list(options?: RequestOptions): Promise<CustomerAccount[]> {
    return this.request<CustomerAccount[]>(
      { method: "GET", path: "/v1/customers" },
      options,
    );
  }
}
