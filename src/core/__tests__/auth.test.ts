import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { TokenProvider } from "../auth.js";
import { AuthenticationError, LayloConfigurationError } from "../errors.js";
import { HttpClient } from "../http.js";

type Call = { url: string; init: RequestInit };

const SECRET_KEY = "shh-integrator-secret";

const CREDENTIALS = {
  userId: "user-1",
  accessKey: "access-key-1",
  secretKey: SECRET_KEY,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const tokenJson = (accessToken: string, expiresIn = 3600) =>
  json(200, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  });

const unauthorized = (message: string, apiKeyStatus?: string) =>
  json(401, {
    error: {
      code: "UNAUTHORIZED",
      message,
      ...(apiKeyStatus === undefined ? {} : { apiKeyStatus }),
    },
  });

type FakeResponse = Response | ((init: RequestInit) => Promise<Response>);

const fakeFetch = (responses: FakeResponse[]) => {
  const calls: Call[] = [];
  const fetch = vi.fn((input: string, init?: RequestInit) => {
    calls.push({ url: input, init: init ?? {} });
    const next = responses.shift();
    if (next === undefined) {
      return Promise.reject(new Error("fake fetch ran out of responses"));
    }
    if (typeof next === "function") {
      return next(init ?? {});
    }
    return Promise.resolve(next);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

const headersOf = (call: Call) => new Headers(call.init.headers);

const setup = (responses: FakeResponse[]) => {
  const { fetch, calls } = fakeFetch(responses);
  const http = new HttpClient({
    baseUrl: "https://api.example.test/api",
    fetch,
    timeoutMs: 5_000,
    userAgent: "laylo-node/test",
  });
  let now = 0;
  const provider = new TokenProvider({
    ...CREDENTIALS,
    http,
    clock: () => now,
  });
  return { calls, http, provider, setNow: (ms: number) => (now = ms) };
};

describe("TokenProvider", () => {
  it("rejects a userId containing a '.' before any request", () => {
    const { http } = setup([]);
    const build = () =>
      new TokenProvider({
        ...CREDENTIALS,
        userId: "user-1.access-key-1",
        http,
      });

    expect(build).toThrow(LayloConfigurationError);
    expect(build).toThrow(/accessKey/);
  });

  it.each(["userId", "accessKey", "secretKey"] as const)(
    "rejects a missing or empty %s before any request",
    (option) => {
      const { http } = setup([]);
      for (const value of [undefined, ""]) {
        const build = () =>
          new TokenProvider({
            ...CREDENTIALS,
            [option]: value as unknown as string,
            http,
          });

        expect(build).toThrow(LayloConfigurationError);
        expect(build).toThrow(option);
        expect(build).toThrow(/developers\.laylo\.com\/authentication/);
      }
    },
  );

  it("mints on first call and serves the cached token within the TTL", async () => {
    const { calls, provider, setNow } = setup([tokenJson("token-1")]);

    await expect(provider.getToken()).resolves.toBe("token-1");
    setNow(1_000_000);
    await expect(provider.getToken()).resolves.toBe("token-1");

    expect(calls).toHaveLength(1);
  });

  it("mints without Authorization or X-Api-Key, joining the user id and access key into client_id", async () => {
    const { calls, provider } = setup([tokenJson("token-1")]);

    await provider.getToken();

    expect(calls[0]?.url).toBe("https://api.example.test/api/v1/auth/token");
    expect(calls[0]?.init.method).toBe("POST");
    expect(headersOf(calls[0] as Call).has("authorization")).toBe(false);
    expect(headersOf(calls[0] as Call).has("x-api-key")).toBe(false);
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      client_id: "user-1.access-key-1",
      client_secret: SECRET_KEY,
    });
  });

  it("refreshes one skew before expiry", async () => {
    const { calls, provider, setNow } = setup([
      tokenJson("token-1"),
      tokenJson("token-2"),
    ]);

    await provider.getToken();
    setNow(3_539_999);
    await expect(provider.getToken()).resolves.toBe("token-1");
    setNow(3_540_000);
    await expect(provider.getToken()).resolves.toBe("token-2");

    expect(calls).toHaveLength(2);
  });

  it("keeps a usable window when expires_in is only 60", async () => {
    const { calls, provider, setNow } = setup([
      tokenJson("token-1", 60),
      tokenJson("token-2", 60),
    ]);

    await provider.getToken();
    setNow(29_999);
    await expect(provider.getToken()).resolves.toBe("token-1");
    setNow(30_000);
    await expect(provider.getToken()).resolves.toBe("token-2");

    expect(calls).toHaveLength(2);
  });

  it("shares one mint across concurrent callers", async () => {
    const { calls, provider } = setup([tokenJson("token-1")]);

    const tokens = await Promise.all(
      Array.from({ length: 10 }, () => provider.getToken()),
    );

    expect(tokens).toEqual(Array.from({ length: 10 }, () => "token-1"));
    expect(calls).toHaveLength(1);
  });

  it("keeps the shared mint alive when one caller aborts", async () => {
    let releaseMint!: () => void;
    const gate = new Promise<void>((resolve) => (releaseMint = resolve));
    const { calls, provider } = setup([
      (init) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason as Error),
          );
          void gate.then(() => resolve(tokenJson("token-1")));
        }),
    ]);

    const controller = new AbortController();
    const abortedCall = provider.getToken(controller.signal);
    const sharedCall = provider.getToken();
    controller.abort(new Error("caller gave up"));

    await expect(abortedCall).rejects.toThrow("caller gave up");
    releaseMint();
    await expect(sharedCall).resolves.toBe("token-1");
    expect(calls).toHaveLength(1);
  });

  it("rejects invalid credentials without caching the failure", async () => {
    const { calls, provider } = setup([
      unauthorized("Invalid client credentials."),
      tokenJson("token-2"),
    ]);

    await expect(provider.getToken()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    await expect(provider.getToken()).resolves.toBe("token-2");

    expect(calls).toHaveLength(2);
  });

  it("ignores invalidate for a token it no longer holds", async () => {
    const { calls, provider } = setup([tokenJson("token-1")]);
    await provider.getToken();

    provider.invalidate("token-0");

    await expect(provider.getToken()).resolves.toBe("token-1");
    expect(calls).toHaveLength(1);
  });

  it("keeps the secret key and token out of JSON serialization", async () => {
    const { provider } = setup([tokenJson("token-1")]);
    await provider.getToken();

    const serialized = JSON.stringify(provider);

    expect(serialized).not.toContain(SECRET_KEY);
    expect(serialized).not.toContain("token-1");
  });

  it("keeps the secret key and token out of inspect output", async () => {
    const { provider } = setup([tokenJson("token-1")]);
    await provider.getToken();

    const inspected = inspect(provider);

    expect(inspected).not.toContain(SECRET_KEY);
    expect(inspected).not.toContain("token-1");
  });

  it("keeps the secret key out of stringified mint errors", async () => {
    const { provider } = setup([unauthorized("Invalid client credentials.")]);

    const error = await provider.getToken().then(
      () => {
        throw new Error("expected getToken to reject");
      },
      (thrown: unknown) => thrown,
    );

    expect(String(error)).not.toContain(SECRET_KEY);
    expect(inspect(error)).not.toContain(SECRET_KEY);
  });

  it("mints a fresh token for every createToken call", async () => {
    const { calls, provider } = setup([
      tokenJson("token-1"),
      tokenJson("token-2"),
    ]);

    await expect(provider.createToken()).resolves.toEqual({
      access_token: "token-1",
      token_type: "Bearer",
      expires_in: 3600,
    });
    await expect(provider.createToken()).resolves.toMatchObject({
      access_token: "token-2",
    });

    expect(calls).toHaveLength(2);
  });
});

describe("HttpClient bearer provider", () => {
  const dataRequest = (provider: TokenProvider) => ({
    method: "POST" as const,
    path: "/v1/conversions/events",
    body: { action: "PURCHASE" },
    auth: { bearer: provider, apiKey: "customer-key" },
  });

  it("attaches the minted token as the bearer on data routes", async () => {
    const { calls, http, provider } = setup([
      tokenJson("token-1"),
      json(200, { ok: true }),
    ]);

    await http.request(dataRequest(provider));

    expect(headersOf(calls[1] as Call).get("authorization")).toBe(
      "Bearer token-1",
    );
    expect(headersOf(calls[1] as Call).get("x-api-key")).toBe("customer-key");
  });

  it("treats a null bearer as no bearer", async () => {
    const { calls, http } = setup([json(200, { ok: true })]);

    await http.request({
      method: "GET",
      path: "/v1/drops",
      auth: {
        bearer: null as unknown as string,
        apiKey: "customer-key",
      },
    });

    expect(headersOf(calls[0] as Call).has("authorization")).toBe(false);
    expect(headersOf(calls[0] as Call).get("x-api-key")).toBe("customer-key");
  });

  it("re-mints and replays once when the access token expired", async () => {
    const { calls, http, provider } = setup([
      tokenJson("token-1"),
      unauthorized("Access token expired. Request a new access token."),
      tokenJson("token-2"),
      json(200, { ok: true }),
    ]);

    const { data } = await http.request(dataRequest(provider));

    expect(data).toEqual({ ok: true });
    expect(calls).toHaveLength(4);
    expect(headersOf(calls[3] as Call).get("authorization")).toBe(
      "Bearer token-2",
    );
    expect(JSON.parse(calls[3]?.init.body as string)).toEqual({
      action: "PURCHASE",
    });
  });

  it("re-mints and replays once on a bearer 401 it does not recognize", async () => {
    // A server-side secret rotation rejects the cached token with a message
    // that is not "Access token expired…"; one fresh mint must recover it.
    const { calls, http, provider } = setup([
      tokenJson("token-1"),
      unauthorized("Invalid integration token."),
      tokenJson("token-2"),
      json(200, { ok: true }),
    ]);

    const { data } = await http.request(dataRequest(provider));

    expect(data).toEqual({ ok: true });
    expect(calls).toHaveLength(4);
    expect(headersOf(calls[3] as Call).get("authorization")).toBe(
      "Bearer token-2",
    );
  });

  it("propagates a second expired-token 401 instead of looping", async () => {
    const { calls, http, provider } = setup([
      tokenJson("token-1"),
      unauthorized("Access token expired. Request a new access token."),
      tokenJson("token-2"),
      unauthorized("Access token expired. Request a new access token."),
    ]);

    await expect(http.request(dataRequest(provider))).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(calls).toHaveLength(4);
  });

  it("does not re-mint when the 401 marks the customer key invalid", async () => {
    const { calls, http, provider } = setup([
      tokenJson("token-1"),
      unauthorized("Invalid Customer API Key", "invalid"),
    ]);

    await expect(http.request(dataRequest(provider))).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(calls).toHaveLength(2);
  });

  it("spends one futile re-mint on an unmarked customer-key 401", async () => {
    // "Customer account not found" carries no apiKeyStatus marker, so it is
    // indistinguishable from a stale bearer — the accepted cost of surviving
    // reworded bearer 401s is a single bounded replay here.
    const { calls, http, provider } = setup([
      tokenJson("token-1"),
      unauthorized("Customer account not found"),
      tokenJson("token-2"),
      unauthorized("Customer account not found"),
    ]);

    await expect(http.request(dataRequest(provider))).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(calls).toHaveLength(4);
  });
});
