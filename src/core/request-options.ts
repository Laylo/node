/**
 * Per-call overrides accepted by every SDK method as its last argument.
 * @example
 * ```ts
 * const controller = new AbortController();
 * const page = await laylo.conversions.events.list(
 *   { action: "PURCHASE" },
 *   { signal: controller.signal, timeoutMs: 10_000 },
 * );
 * ```
 */
export interface RequestOptions {
  /**
   * API key to authenticate this call with, overriding the client's key. Useful
   * when one process acts on behalf of several Laylo accounts.
   */
  apiKey?: string;
  /** Aborts the request (and any pages it goes on to fetch) when signalled. */
  signal?: AbortSignal;
  /** Overrides the client-wide timeout, in milliseconds, for this call. */
  timeoutMs?: number;
  /** Set to `false` to disable automatic retries for this call. */
  retry?: boolean;
}
