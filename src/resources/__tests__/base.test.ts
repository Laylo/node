import { describe, expect, it } from "vitest";

import { LayloConfigurationError, ServerError } from "../../core/errors.js";
import { Keys } from "../keys.js";
import { fakeContext, headersOf, json } from "./harness.js";

const verified = () =>
  json(200, {
    apiKeyStatus: "valid",
    message: "API key verified successfully",
  });

describe("APIResource", () => {
  it("prefers the per-request apiKey over the context's", async () => {
    const { context, apiCalls } = fakeContext([verified()], {
      apiKey: "default-key",
    });

    await new Keys(context).verify({ apiKey: "override-key" });

    const [call] = apiCalls();
    expect(call && headersOf(call).get("x-api-key")).toBe("override-key");
  });

  it("sends the context's creator id when the call names no customer", async () => {
    const { context, apiCalls } = fakeContext([verified()], {
      creatorId: "roster-user",
    });

    await new Keys(context).verify();

    const [call] = apiCalls();
    expect(call && headersOf(call).get("x-creator-id")).toBe("roster-user");
    expect(call && headersOf(call).has("x-api-key")).toBe(false);
  });

  it("replaces the context's key with a per-request creator id, not alongside it", async () => {
    const { context, apiCalls } = fakeContext([verified()], {
      apiKey: "default-key",
    });

    await new Keys(context).verify({ creatorId: "roster-user" });

    const [call] = apiCalls();
    expect(call && headersOf(call).get("x-creator-id")).toBe("roster-user");
    expect(call && headersOf(call).has("x-api-key")).toBe(false);
  });

  it("replaces the context's creator id with a per-request key", async () => {
    const { context, apiCalls } = fakeContext([verified()], {
      creatorId: "roster-user",
    });

    await new Keys(context).verify({ apiKey: "override-key" });

    const [call] = apiCalls();
    expect(call && headersOf(call).get("x-api-key")).toBe("override-key");
    expect(call && headersOf(call).has("x-creator-id")).toBe(false);
  });

  it("refuses a call that names the customer both ways", async () => {
    const { context, calls } = fakeContext([]);

    await expect(
      new Keys(context).verify({ apiKey: "key", creatorId: "user" }),
    ).rejects.toBeInstanceOf(LayloConfigurationError);
    expect(calls).toHaveLength(0);
  });

  it("throws LayloConfigurationError before any fetch when no customer is supplied", async () => {
    const { context, calls } = fakeContext([]);

    const failure: unknown = await new Keys(context)
      .verify()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LayloConfigurationError);
    expect((failure as Error).message).toContain("apiKey");
    expect((failure as Error).message).toContain("creatorId");
    expect((failure as Error).message).toContain("forCustomer");
    expect(calls).toHaveLength(0);
  });

  it("forwards per-call options to the transport", async () => {
    const { context, apiCalls } = fakeContext(
      [json(500, { error: { code: "INTERNAL", message: "boom" } })],
      { apiKey: "default-key" },
    );

    const failure: unknown = await new Keys(context)
      .verify({ retry: false })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServerError);
    expect(apiCalls()).toHaveLength(1);
  });
});
