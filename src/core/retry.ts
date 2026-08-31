/** Default number of retries after the first attempt. */
export const DEFAULT_MAX_RETRIES = 2;

const BASE_DELAY_MS = 500;
/** Longest the SDK will wait between attempts. */
export const MAX_DELAY_MS = 8_000;

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Whether a response status is worth retrying. Only transient conditions
 * qualify; every other 4xx means the request itself needs to change.
 * @param status The HTTP status code.
 * @returns `true` when a retry may succeed.
 */
export const isRetryableStatus = (status: number): boolean =>
  RETRYABLE_STATUSES.has(status);

/**
 * Parses a `Retry-After` header into seconds. Accepts both the delay-seconds
 * and HTTP-date forms.
 * @param value The raw header value, or `null` when absent.
 * @param now The current time in milliseconds, for HTTP-date values.
 * @returns Seconds to wait, or `undefined` when the header is missing or unparseable.
 */
export const parseRetryAfter = (
  value: string | null,
  now: number = Date.now(),
): number | undefined => {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const at = Date.parse(trimmed);
  return Number.isNaN(at)
    ? undefined
    : Math.max(0, Math.ceil((at - now) / 1000));
};

/**
 * How long to wait before the given retry. Exponential backoff with full
 * jitter, or the delay the server asked for via `Retry-After`, capped at
 * `MAX_DELAY_MS`. The transport does not retry at all when `Retry-After`
 * exceeds the cap; that is left for the caller via `RateLimitError.retryAfter`.
 * @param attempt Zero-based index of the attempt that just failed.
 * @param retryAfterSeconds Server-requested delay, when present.
 * @param random Source of jitter in `[0, 1)`; injectable for tests.
 * @returns Delay in milliseconds.
 */
export const backoffMs = (
  attempt: number,
  retryAfterSeconds?: number,
  random: () => number = Math.random,
): number => {
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, MAX_DELAY_MS);
  }
  const exponential = 2 ** attempt * BASE_DELAY_MS;
  return Math.min(exponential + random() * BASE_DELAY_MS, MAX_DELAY_MS);
};
