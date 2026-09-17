/**
 * Per-call overrides accepted by every SDK method as its last argument.
 * @example
 * ```ts
 * const controller = new AbortController();
 * const purchases = await laylo.conversions.list(
 *   { action: "PURCHASE" },
 *   { signal: controller.signal, timeoutMs: 10_000 },
 * );
 * ```
 */
export interface RequestOptions {
  /**
   * Customer API key to act with on this call, replacing whichever customer the
   * client is scoped to. Useful when one process acts on behalf of several
   * Laylo accounts. Pass either this or `creatorId`, not both.
   */
  apiKey?: string;
  /**
   * Laylo user id of a customer on your roster to act as on this call, in place
   * of an API key, replacing whichever customer the client is scoped to. Pass
   * either this or `apiKey`, not both.
   */
  creatorId?: string;
  /** Aborts the request when signalled. */
  signal?: AbortSignal;
  /** Overrides the client-wide timeout, in milliseconds, for this call. */
  timeoutMs?: number;
  /**
   * Set to `false` to disable automatic retries for this call's own attempts.
   * A shared token mint keeps its own schedule, and a rejected bearer is
   * still replayed once.
   */
  retry?: boolean;
}
