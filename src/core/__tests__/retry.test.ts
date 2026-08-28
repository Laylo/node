import { describe, expect, it } from "vitest";

import {
  backoffMs,
  DEFAULT_MAX_RETRIES,
  isRetryableStatus,
  parseRetryAfter,
} from "../retry.js";

describe("isRetryableStatus", () => {
  it("retries transient statuses only", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
    for (const status of [200, 400, 401, 403, 404, 409, 422, 501]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });

  it("defaults to two retries", () => {
    expect(DEFAULT_MAX_RETRIES).toBe(2);
  });
});

describe("parseRetryAfter", () => {
  it("returns undefined for a missing header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it("parses delay-seconds", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter(" 7 ")).toBe(7);
  });

  it("parses HTTP dates relative to now", () => {
    const now = Date.parse("Thu, 01 Jan 2026 00:00:00 GMT");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10);
    expect(parseRetryAfter("Wed, 31 Dec 2025 23:59:00 GMT", now)).toBe(0);
  });

  it("uses the current time by default for HTTP dates", () => {
    const soon = new Date(Date.now() + 60_000).toUTCString();
    const seconds = parseRetryAfter(soon);
    expect(seconds).toBeGreaterThanOrEqual(58);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it("returns undefined for garbage", () => {
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
  });
});

describe("backoffMs", () => {
  it("honors Retry-After in seconds", () => {
    expect(backoffMs(0, 3)).toBe(3000);
    expect(backoffMs(5, 0)).toBe(0);
  });

  it("grows exponentially with jitter", () => {
    expect(backoffMs(0, undefined, () => 0)).toBe(500);
    expect(backoffMs(1, undefined, () => 0)).toBe(1000);
    expect(backoffMs(2, undefined, () => 0.5)).toBe(2250);
  });

  it("caps at eight seconds", () => {
    expect(backoffMs(10, undefined, () => 0.99)).toBe(8000);
  });

  it("uses Math.random by default", () => {
    const delay = backoffMs(0);
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThan(1000);
  });
});
