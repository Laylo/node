import { describe, expect, expectTypeOf, it } from "vitest";

import { AuthenticationError, PermissionError } from "../../core/errors.js";
import type { VerifyKeyResponse } from "../../types.js";
import { Keys } from "../keys.js";
import { fakeContext, headersOf, json } from "./harness.js";

const verified = () =>
  json(200, {
    apiKeyStatus: "valid",
    message: "API key verified successfully",
  });

describe("Keys", () => {
  it("issues GET /v1/keys/verify with the bearer and customer key and no body", async () => {
    const { context, apiCalls } = fakeContext([verified()], {
      apiKey: "customer-key-1",
    });

    const result = await new Keys(context).verify();

    expect(result).toEqual({
      apiKeyStatus: "valid",
      message: "API key verified successfully",
    });
    const [call] = apiCalls();
    expect(call?.url).toBe("https://api.example.test/api/v1/keys/verify");
    expect(call?.init.method).toBe("GET");
    expect(call && headersOf(call).get("authorization")).toBe(
      "Bearer integrator-token",
    );
    expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
    expect(call?.init.body).toBeUndefined();
  });

  it("reports not_provided when the customer was named by creator id", async () => {
    const { context, apiCalls } = fakeContext(
      [
        json(200, {
          apiKeyStatus: "not_provided",
          message:
            "Customer authorized by creator id; no customer API key was sent",
        }),
      ],
      { creatorId: "roster-user" },
    );

    const result = await new Keys(context).verify();

    expect(result.apiKeyStatus).toBe("not_provided");
    const [call] = apiCalls();
    expect(call && headersOf(call).get("x-creator-id")).toBe("roster-user");
    expect(call && headersOf(call).has("x-api-key")).toBe(false);
  });

  it("maps a 403 for an id outside the roster to PermissionError", async () => {
    const { context } = fakeContext(
      [
        json(403, {
          error: {
            code: "FORBIDDEN",
            message: "Integration does not manage this customer account",
          },
        }),
      ],
      { creatorId: "stranger" },
    );

    const failure: unknown = await new Keys(context)
      .verify()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PermissionError);
    expect((failure as PermissionError).message).toBe(
      "Integration does not manage this customer account",
    );
  });

  it("returns the typed verify body", () => {
    const { context } = fakeContext([], { apiKey: "customer-key-1" });

    expectTypeOf(
      new Keys(context).verify(),
    ).resolves.toEqualTypeOf<VerifyKeyResponse>();
  });

  it("maps a 401 for an invalid key to AuthenticationError with apiKeyStatus", async () => {
    const { context } = fakeContext(
      [
        json(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid Customer API Key",
            apiKeyStatus: "invalid",
          },
        }),
      ],
      { apiKey: "customer-key-1" },
    );

    const failure: unknown = await new Keys(context)
      .verify()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AuthenticationError);
    expect((failure as AuthenticationError).apiKeyStatus).toBe("invalid");
    expect((failure as AuthenticationError).message).toBe(
      "Invalid Customer API Key",
    );
  });
});
