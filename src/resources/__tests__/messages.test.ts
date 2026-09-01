import { describe, expect, expectTypeOf, it } from "vitest";

import type { Drop } from "../../types.js";
import { Messages } from "../messages.js";
import { drop, fakeContext, headersOf, json } from "./harness.js";

describe("Messages", () => {
  it("issues GET /v1/messages/scheduled with the bearer and customer key and no body", async () => {
    const { context, apiCalls } = fakeContext([json(200, [drop("drop-1")])], {
      apiKey: "customer-key-1",
    });

    const scheduled = await new Messages(context).scheduled.list();

    expect(scheduled).toEqual([drop("drop-1")]);
    const [call] = apiCalls();
    expect(call?.url).toBe(
      "https://api.example.test/api/v1/messages/scheduled",
    );
    expect(call?.init.method).toBe("GET");
    expect(call && headersOf(call).get("authorization")).toBe(
      "Bearer integrator-token",
    );
    expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
    expect(call?.init.body).toBeUndefined();
  });

  it("returns the typed drop array", () => {
    const { context } = fakeContext([], { apiKey: "customer-key-1" });

    expectTypeOf(new Messages(context).scheduled.list()).resolves.toEqualTypeOf<
      Drop[]
    >();
  });
});
