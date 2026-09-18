import { describe, expect, expectTypeOf, it } from "vitest";

import { LayloConfigurationError } from "../errors.js";
import { isoTimestamp } from "../time.js";

describe("isoTimestamp", () => {
  it("renders a Date as its ISO 8601 string", () => {
    expect(isoTimestamp(new Date("2026-08-25T12:30:00Z"), "startDate")).toBe(
      "2026-08-25T12:30:00.000Z",
    );
  });

  it("passes a string through untouched", () => {
    expect(isoTimestamp("2026-08-25T12:30:00+02:00", "startDate")).toBe(
      "2026-08-25T12:30:00+02:00",
    );
  });

  it("leaves undefined absent so an optional field is omitted", () => {
    expect(isoTimestamp(undefined, "startDate")).toBeUndefined();
  });

  it("rejects an invalid Date, naming the field", () => {
    expect(() => isoTimestamp(new Date("nope"), "consentGrantedAt")).toThrow(
      LayloConfigurationError,
    );
    expect(() => isoTimestamp(new Date("nope"), "consentGrantedAt")).toThrow(
      /^consentGrantedAt is an invalid Date/,
    );
  });

  it("narrows undefined away for a required argument", () => {
    expectTypeOf(isoTimestamp(new Date(), "startDate")).toEqualTypeOf<string>();
    expectTypeOf(
      isoTimestamp(undefined as string | Date | undefined, "startDate"),
    ).toEqualTypeOf<string | undefined>();
  });
});
