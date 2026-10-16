import { describe, expect, it } from "vitest";

import { assertBatchSize } from "../batch.js";
import { LayloConfigurationError } from "../errors.js";

describe("assertBatchSize", () => {
  it("accepts one entry and exactly max entries", () => {
    expect(() => assertBatchSize("to", ["a"], 2, "item")).not.toThrow();
    expect(() => assertBatchSize("to", ["a", "b"], 2, "item")).not.toThrow();
  });

  it("rejects an empty array, naming the field", () => {
    expect(() => assertBatchSize("to", [], 2, "item")).toThrow(
      LayloConfigurationError,
    );
    expect(() => assertBatchSize("to", [], 2, "item")).toThrow(
      /^to must contain at least one item$/,
    );
  });

  it("rejects more than max entries with the count received", () => {
    expect(() => assertBatchSize("to", ["a", "b", "c"], 2, "item")).toThrow(
      /^to must contain at most 2 items, received 3$/,
    );
  });
});
