import { describe, expect, expectTypeOf, it } from "vitest";

import type { Drop } from "../../types.js";
import { Drops } from "../drops.js";
import { drop, fakeContext, headersOf, json } from "./harness.js";

describe("Drops", () => {
  it("issues GET /v1/drops with the bearer and customer key and no body", async () => {
    const { context, apiCalls } = fakeContext(
      [json(200, [drop("drop-1"), drop("drop-2")])],
      { apiKey: "customer-key-1" },
    );

    const drops = await new Drops(context).list();

    expect(drops).toEqual([drop("drop-1"), drop("drop-2")]);
    const [call] = apiCalls();
    expect(call?.url).toBe("https://api.example.test/api/v1/drops");
    expect(call?.init.method).toBe("GET");
    expect(call && headersOf(call).get("authorization")).toBe(
      "Bearer integrator-token",
    );
    expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
    expect(call?.init.body).toBeUndefined();
  });

  it("returns the typed drop array", () => {
    const { context } = fakeContext([], { apiKey: "customer-key-1" });

    expectTypeOf(new Drops(context).list()).resolves.toEqualTypeOf<Drop[]>();
  });
});
