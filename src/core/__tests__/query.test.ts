import { describe, expect, it } from "vitest";

import { LayloConfigurationError } from "../errors.js";
import { buildQuery } from "../query.js";

describe("buildQuery", () => {
  it("skips undefined and null", () => {
    expect(buildQuery({ a: undefined, b: null, c: "x" }).toString()).toBe(
      "c=x",
    );
  });

  it("repeats the key for arrays and skips empty entries", () => {
    expect(
      buildQuery({ action: ["PURCHASE", null, "RSVP", undefined] }).toString(),
    ).toBe("action=PURCHASE&action=RSVP");
  });

  it("stringifies booleans and numbers", () => {
    expect(buildQuery({ limit: 25, active: false, n: 0 }).toString()).toBe(
      "limit=25&active=false&n=0",
    );
  });

  it("encodes reserved characters", () => {
    expect(buildQuery({ q: "a b&c" }).toString()).toBe("q=a+b%26c");
  });

  it("rejects objects", () => {
    expect(() => buildQuery({ filter: { a: 1 } })).toThrow(
      LayloConfigurationError,
    );
    expect(() => buildQuery({ filter: [{ a: 1 }] })).toThrow(
      'Query parameter "filter" must be a string, number, or boolean',
    );
    expect(() => buildQuery({ when: new Date(0) })).toThrow(
      LayloConfigurationError,
    );
  });
});
