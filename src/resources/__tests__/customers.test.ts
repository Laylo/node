import { describe, expect, expectTypeOf, it } from "vitest";

import { PermissionError } from "../../core/errors.js";
import type { CustomerAccount } from "../../types.js";
import { Customers } from "../customers.js";
import { fakeContext, headersOf, json } from "./harness.js";

const customer = (id: string): CustomerAccount => ({
  id,
  displayName: "Laylo Records",
  username: "laylorecords",
  createdAt: 1_722_500_000_000,
});

describe("Customers", () => {
  it("issues GET /v1/customers with the bearer and customer key and no body", async () => {
    const { context, apiCalls } = fakeContext(
      [json(200, [customer("creator-1"), customer("creator-2")])],
      { apiKey: "customer-key-1" },
    );

    const customers = await new Customers(context).list();

    expect(customers).toEqual([customer("creator-1"), customer("creator-2")]);
    const [call] = apiCalls();
    expect(call?.url).toBe("https://api.example.test/api/v1/customers");
    expect(call?.init.method).toBe("GET");
    expect(call && headersOf(call).get("authorization")).toBe(
      "Bearer integrator-token",
    );
    expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
    expect(call?.init.body).toBeUndefined();
  });

  it("works for a customer named by creator id", async () => {
    const { context, apiCalls } = fakeContext([json(200, [])], {
      creatorId: "roster-user",
    });

    await new Customers(context).list();

    const [call] = apiCalls();
    expect(call && headersOf(call).get("x-creator-id")).toBe("roster-user");
    expect(call && headersOf(call).has("x-api-key")).toBe(false);
  });

  it("keeps null display names, usernames, and creation dates", async () => {
    const bare = {
      id: "creator-3",
      displayName: null,
      username: null,
      createdAt: null,
    };
    const { context } = fakeContext([json(200, [bare])], {
      apiKey: "customer-key-1",
    });

    const customers = await new Customers(context).list();

    expect(customers).toEqual([bare]);
  });

  it("maps a 403 to PermissionError", async () => {
    const { context } = fakeContext(
      [
        json(403, {
          error: {
            code: "FORBIDDEN",
            message: "Customer account does not have a paid Laylo plan",
          },
        }),
      ],
      { apiKey: "customer-key-1" },
    );

    const failure: unknown = await new Customers(context)
      .list()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PermissionError);
  });

  it("returns the typed customer array", () => {
    const { context } = fakeContext([], { apiKey: "customer-key-1" });

    expectTypeOf(new Customers(context).list()).resolves.toEqualTypeOf<
      CustomerAccount[]
    >();
  });
});
