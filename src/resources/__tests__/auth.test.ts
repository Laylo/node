import { describe, expect, it, vi } from "vitest";

import { TokenProvider } from "../../core/auth.js";
import { HttpClient } from "../../core/http.js";
import { Auth } from "../auth.js";

const tokenResponse = (accessToken: string) =>
  new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const setup = () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(tokenResponse("token-1"))
    .mockResolvedValueOnce(
      tokenResponse("token-2"),
    ) as unknown as typeof globalThis.fetch;
  const http = new HttpClient({
    baseUrl: "https://api.example.test/api",
    fetch,
    timeoutMs: 5_000,
    userAgent: "laylo-node/test",
  });
  const provider = new TokenProvider({
    clientId: "user-1.access-key-1",
    clientSecret: "shh-integrator-secret",
    http,
  });
  return { auth: new Auth(provider), fetch };
};

describe("Auth", () => {
  it("returns the full token response from createToken", async () => {
    const { auth } = setup();

    await expect(auth.createToken()).resolves.toEqual({
      access_token: "token-1",
      token_type: "Bearer",
      expires_in: 3600,
    });
  });

  it("mints a fresh token on every call", async () => {
    const { auth, fetch } = setup();

    await auth.createToken();
    await expect(auth.createToken()).resolves.toMatchObject({
      access_token: "token-2",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
