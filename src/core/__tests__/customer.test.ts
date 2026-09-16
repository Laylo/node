import { describe, expect, it } from "vitest";

import { customerFrom } from "../customer.js";
import { LayloConfigurationError } from "../errors.js";

describe("customerFrom", () => {
  it("names a customer by API key", () => {
    expect(customerFrom({ apiKey: "key-1" })).toEqual({ apiKey: "key-1" });
  });

  it("names a customer by creator id", () => {
    expect(customerFrom({ creatorId: "user-2" })).toEqual({
      creatorId: "user-2",
    });
  });

  it("returns undefined when neither field is set", () => {
    expect(customerFrom({})).toBeUndefined();
    expect(
      customerFrom({ apiKey: undefined, creatorId: undefined }),
    ).toBeUndefined();
  });

  it("refuses both at once rather than letting the API pick", () => {
    expect(() =>
      customerFrom({ apiKey: "key-1", creatorId: "user-2" }),
    ).toThrow(LayloConfigurationError);
  });

  it.each([
    ["apiKey", { apiKey: "" }],
    ["creatorId", { creatorId: "" }],
  ])("rejects an empty %s", (field, fields) => {
    let thrown: unknown;
    try {
      customerFrom(fields);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LayloConfigurationError);
    expect((thrown as Error).message).toContain(field);
  });
});
