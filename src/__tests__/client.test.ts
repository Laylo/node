import { inspect } from "node:util";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import { Laylo } from "../client.js";
import { VERSION } from "../version.js";
import { LayloConfigurationError } from "../core/errors.js";
import { Auth } from "../resources/auth.js";
import { Conversions } from "../resources/conversions.js";
import { Drops } from "../resources/drops.js";
import { Fans } from "../resources/fans.js";
import { Keys } from "../resources/keys.js";
import { Messages } from "../resources/messages.js";
import type { VerifyKeyResponse } from "../types.js";
import {
  bodyOf,
  headersOf,
  json,
  type Call,
} from "../resources/__tests__/harness.js";

const token = () =>
  json(200, {
    access_token: "integrator-token",
    token_type: "Bearer",
    expires_in: 3600,
  });

const fakeFetch = () => {
  const calls: Call[] = [];
  const fetch = vi.fn((input: string, init?: RequestInit) => {
    calls.push({ url: input, init: init ?? {} });
    return Promise.resolve(
      input.endsWith("/v1/auth/token") ? token() : json(200, { valid: true }),
    );
  }) as unknown as typeof globalThis.fetch;
  return {
    fetch,
    calls,
    apiCalls: () => calls.filter((call) => !isMint(call)),
  };
};

const isMint = (call: Call) => call.url.endsWith("/v1/auth/token");

const credentials = {
  clientId: "user-1.access-key-1",
  clientSecret: "shh-integrator-secret",
};

const clientWith = (options: Record<string, unknown> = {}) => {
  const { fetch, calls, apiCalls } = fakeFetch();
  const laylo = new Laylo({ ...credentials, fetch, ...options });
  return { laylo, calls, apiCalls };
};

beforeEach(() => {
  vi.stubEnv("LAYLO_CLIENT_ID", undefined);
  vi.stubEnv("LAYLO_CLIENT_SECRET", undefined);
  vi.stubEnv("LAYLO_API_KEY", undefined);
  vi.stubEnv("LAYLO_CREATOR_ID", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credentials", () => {
  it("falls back to the environment for all three", async () => {
    vi.stubEnv("LAYLO_CLIENT_ID", "env-user.env-key");
    vi.stubEnv("LAYLO_CLIENT_SECRET", "env-secret");
    vi.stubEnv("LAYLO_API_KEY", "env-api-key");
    const { fetch, calls, apiCalls } = fakeFetch();

    await new Laylo({ fetch }).keys.verify();

    expect(bodyOf(calls[0])).toEqual({
      client_id: "env-user.env-key",
      client_secret: "env-secret",
    });
    expect(headersOf(apiCalls()[0]!).get("X-Api-Key")).toBe("env-api-key");
  });

  it("prefers explicit options over the environment", async () => {
    vi.stubEnv("LAYLO_CLIENT_ID", "env-user.env-key");
    vi.stubEnv("LAYLO_CLIENT_SECRET", "env-secret");
    vi.stubEnv("LAYLO_API_KEY", "env-api-key");
    const { fetch, calls, apiCalls } = fakeFetch();

    await new Laylo({
      ...credentials,
      apiKey: "explicit-key",
      fetch,
    }).keys.verify();

    expect(bodyOf(calls[0])).toEqual({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });
    expect(headersOf(apiCalls()[0]!).get("X-Api-Key")).toBe("explicit-key");
  });

  it.each([
    ["clientId", "LAYLO_CLIENT_ID"],
    ["clientSecret", "LAYLO_CLIENT_SECRET"],
  ])("reports a missing %s", (option, env) => {
    let thrown: unknown;
    try {
      new Laylo(
        option === "clientId"
          ? { clientSecret: credentials.clientSecret }
          : { clientId: credentials.clientId },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LayloConfigurationError);
    const { message } = thrown as Error;
    expect(message).toContain(option);
    expect(message).toContain(env);
    expect(message).toContain("https://developers.laylo.com/authentication");
  });

  it("rejects an empty clientId instead of reading the environment", () => {
    vi.stubEnv("LAYLO_CLIENT_ID", "env-user.env-key");

    expect(() => new Laylo({ ...credentials, clientId: "" })).toThrow(
      LayloConfigurationError,
    );
  });

  it("rejects an empty apiKey", () => {
    expect(() => new Laylo({ ...credentials, apiKey: "" })).toThrow(
      LayloConfigurationError,
    );
  });

  it("treats an empty LAYLO_API_KEY as unset", () => {
    vi.stubEnv("LAYLO_API_KEY", "");

    expect(new Laylo(credentials).toJSON().apiKey).toBeUndefined();
  });

  it("reads LAYLO_CREATOR_ID when no key is configured", async () => {
    vi.stubEnv("LAYLO_CREATOR_ID", "env-user");
    const { fetch, apiCalls } = fakeFetch();

    await new Laylo({ ...credentials, fetch }).keys.verify();

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("X-Creator-Id")).toBe("env-user");
    expect(headers.has("X-Api-Key")).toBe(false);
  });

  it("lets an explicit creatorId win over LAYLO_API_KEY in the environment", async () => {
    vi.stubEnv("LAYLO_API_KEY", "env-api-key");
    const { fetch, apiCalls } = fakeFetch();

    await new Laylo({
      ...credentials,
      creatorId: "explicit-user",
      fetch,
    }).keys.verify();

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("X-Creator-Id")).toBe("explicit-user");
    expect(headers.has("X-Api-Key")).toBe(false);
  });

  it("lets an explicit apiKey win over LAYLO_CREATOR_ID in the environment", async () => {
    vi.stubEnv("LAYLO_CREATOR_ID", "env-user");
    const { fetch, apiCalls } = fakeFetch();

    await new Laylo({
      ...credentials,
      apiKey: "explicit-key",
      fetch,
    }).keys.verify();

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("X-Api-Key")).toBe("explicit-key");
    expect(headers.has("X-Creator-Id")).toBe(false);
  });

  it("rejects apiKey and creatorId together", () => {
    expect(
      () => new Laylo({ ...credentials, apiKey: "key", creatorId: "user" }),
    ).toThrow(LayloConfigurationError);
  });

  it("rejects LAYLO_API_KEY and LAYLO_CREATOR_ID set together", () => {
    vi.stubEnv("LAYLO_API_KEY", "env-api-key");
    vi.stubEnv("LAYLO_CREATOR_ID", "env-user");

    expect(() => new Laylo(credentials)).toThrow(LayloConfigurationError);
  });

  it("names the environment variables, not the options, when the environment clashes", () => {
    vi.stubEnv("LAYLO_API_KEY", "env-api-key");
    vi.stubEnv("LAYLO_CREATOR_ID", "env-user");

    expect(() => new Laylo(credentials)).toThrow(
      /LAYLO_API_KEY or LAYLO_CREATOR_ID/,
    );
  });

  it("rejects an empty creatorId", () => {
    expect(() => new Laylo({ ...credentials, creatorId: "" })).toThrow(
      LayloConfigurationError,
    );
  });
});

describe("transport options", () => {
  it.each([
    "/api",
    "events.laylo.com",
    "ftp://events.laylo.com",
    "not a url",
    "https://events.laylo.com/api?env=staging",
    "https://events.laylo.com/api#v1",
  ])("rejects the baseUrl %s", (baseUrl) => {
    expect(() => new Laylo({ ...credentials, baseUrl })).toThrow(
      LayloConfigurationError,
    );
  });

  it("accepts a local baseUrl", () => {
    const laylo = new Laylo({
      ...credentials,
      baseUrl: "http://localhost:3000",
    });

    expect(laylo.baseUrl).toBe("http://localhost:3000");
  });

  it.each([-1, 0, 1.5, Number.NaN])("rejects the timeoutMs %s", (timeoutMs) => {
    expect(() => new Laylo({ ...credentials, timeoutMs })).toThrow(
      LayloConfigurationError,
    );
  });

  it("names the rejected value, even NaN", () => {
    expect(() => new Laylo({ ...credentials, timeoutMs: Number.NaN })).toThrow(
      "received NaN",
    );
  });

  it.each([-1, 1.5, Number.NaN])("rejects the maxRetries %s", (maxRetries) => {
    expect(() => new Laylo({ ...credentials, maxRetries })).toThrow(
      LayloConfigurationError,
    );
  });

  it("accepts a maxRetries of 0", () => {
    expect(() => new Laylo({ ...credentials, maxRetries: 0 })).not.toThrow();
  });

  it("defaults to the production base URL", async () => {
    const { laylo, calls, apiCalls } = clientWith({ apiKey: "key-1" });

    await laylo.keys.verify();

    expect(laylo.baseUrl).toBe("https://events.laylo.com/api");
    expect(calls[0]?.url).toBe("https://events.laylo.com/api/v1/auth/token");
    expect(apiCalls()[0]?.url).toBe(
      "https://events.laylo.com/api/v1/keys/verify",
    );
  });

  it("identifies itself and the integration", async () => {
    const { laylo, apiCalls } = clientWith({
      apiKey: "key-1",
      source: "acme-checkout",
    });

    await laylo.keys.verify();

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("User-Agent")).toBe(`laylo-node/${VERSION}`);
    expect(headers.get("X-Laylo-Source")).toBe("acme-checkout");
  });

  it("omits the source header when none is given", async () => {
    const { laylo, apiCalls } = clientWith({ apiKey: "key-1" });

    await laylo.keys.verify();

    expect(headersOf(apiCalls()[0]!).get("X-Laylo-Source")).toBeNull();
  });
});

describe("api key precedence", () => {
  it.each([
    ["constructor", "view", "call", "call-key"],
    ["constructor", "view", undefined, "view-key"],
    ["constructor", undefined, "call", "call-key"],
    ["constructor", undefined, undefined, "constructor-key"],
    [undefined, "view", "call", "call-key"],
    [undefined, "view", undefined, "view-key"],
    [undefined, undefined, "call", "call-key"],
  ] as const)(
    "sends %s / %s / %s as %s",
    async (constructed, view, perCall, expected) => {
      const { laylo, apiCalls } = clientWith(
        constructed === undefined ? {} : { apiKey: "constructor-key" },
      );
      const scoped = view === undefined ? laylo : laylo.forCustomer("view-key");

      await scoped.keys.verify(
        perCall === undefined ? undefined : { apiKey: "call-key" },
      );

      expect(headersOf(apiCalls()[0]!).get("X-Api-Key")).toBe(expected);
    },
  );

  it("needs a key from somewhere", async () => {
    const { laylo } = clientWith();

    await expect(laylo.keys.verify()).rejects.toBeInstanceOf(
      LayloConfigurationError,
    );
  });

  it("rebinds on a re-scoped view", async () => {
    const { laylo, apiCalls } = clientWith();

    await laylo
      .forCustomer("first-key")
      .forCustomer("second-key")
      .keys.verify();

    expect(headersOf(apiCalls()[0]!).get("X-Api-Key")).toBe("second-key");
  });

  it("rejects a scope without a key", () => {
    const { laylo } = clientWith();

    expect(() => laylo.forCustomer("")).toThrow(LayloConfigurationError);
  });
});

describe("creator id precedence", () => {
  it("scopes a view to a roster account by id", async () => {
    const { laylo, apiCalls } = clientWith({ apiKey: "constructor-key" });

    await laylo.forCustomer({ creatorId: "roster-user" }).drops.list();

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("X-Creator-Id")).toBe("roster-user");
    expect(headers.has("X-Api-Key")).toBe(false);
  });

  it("accepts an object form for the key as well", async () => {
    const { laylo, apiCalls } = clientWith();

    await laylo.forCustomer({ apiKey: "view-key" }).keys.verify();

    expect(headersOf(apiCalls()[0]!).get("X-Api-Key")).toBe("view-key");
  });

  it("uses the constructor's creatorId when a call names no customer", async () => {
    const { laylo, apiCalls } = clientWith({ creatorId: "constructor-user" });

    await laylo.keys.verify();

    expect(headersOf(apiCalls()[0]!).get("X-Creator-Id")).toBe(
      "constructor-user",
    );
  });

  it("lets a per-call apiKey replace a creator-id scope", async () => {
    const { laylo, apiCalls } = clientWith({ creatorId: "constructor-user" });

    await laylo
      .forCustomer({ creatorId: "view-user" })
      .keys.verify({ apiKey: "call-key" });

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("X-Api-Key")).toBe("call-key");
    expect(headers.has("X-Creator-Id")).toBe(false);
  });

  it("lets a per-call creatorId replace a key scope", async () => {
    const { laylo, apiCalls } = clientWith({ apiKey: "constructor-key" });

    await laylo.forCustomer("view-key").drops.list({ creatorId: "call-user" });

    const headers = headersOf(apiCalls()[0]!);
    expect(headers.get("X-Creator-Id")).toBe("call-user");
    expect(headers.has("X-Api-Key")).toBe(false);
  });

  it.each([
    ["an empty object", {}],
    ["both identifiers", { apiKey: "key", creatorId: "user" }],
    ["an empty creatorId", { creatorId: "" }],
  ])("rejects a scope with %s", (_label, customer) => {
    const { laylo } = clientWith();

    expect(() => laylo.forCustomer(customer as { apiKey: string })).toThrow(
      LayloConfigurationError,
    );
  });
});

describe("forCustomer views", () => {
  it("share one access token across views", async () => {
    const { laylo, calls } = clientWith();

    await laylo.forCustomer("key-1").keys.verify();
    await laylo.forCustomer("key-2").keys.verify();

    expect(calls.filter(isMint)).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it("keep their own resource instances", () => {
    const { laylo } = clientWith({ apiKey: "key-1" });
    const view = laylo.forCustomer("key-2");

    expect(view.keys).not.toBe(laylo.keys);
    expect(view.auth).not.toBe(laylo.auth);
  });
});

describe("resources", () => {
  it("are created once and reused", () => {
    const { laylo } = clientWith({ apiKey: "key-1" });

    expect(laylo.keys).toBe(laylo.keys);
    expect(laylo.drops).toBe(laylo.drops);
    expect(laylo.conversions).toBe(laylo.conversions);
    expect(laylo.fans).toBe(laylo.fans);
    expect(laylo.messages).toBe(laylo.messages);
    expect(laylo.auth).toBe(laylo.auth);
  });

  it("are the expected classes", () => {
    const { laylo } = clientWith({ apiKey: "key-1" });

    expect(laylo.keys).toBeInstanceOf(Keys);
    expect(laylo.drops).toBeInstanceOf(Drops);
    expect(laylo.conversions).toBeInstanceOf(Conversions);
    expect(laylo.fans).toBeInstanceOf(Fans);
    expect(laylo.messages).toBeInstanceOf(Messages);
    expect(laylo.auth).toBeInstanceOf(Auth);
  });

  it("resolve to the endpoint's response type", () => {
    const verify = () => new Laylo(credentials).keys.verify();

    expectTypeOf(verify).returns.resolves.toEqualTypeOf<VerifyKeyResponse>();
  });
});

describe("redaction", () => {
  it("keeps the secret and the full key out of logs", () => {
    const { laylo } = clientWith({ apiKey: "customer-abcd1234" });

    const shown = inspect(laylo);
    const serialized = JSON.stringify(laylo);

    for (const text of [shown, serialized]) {
      expect(text).not.toContain(credentials.clientSecret);
      expect(text).not.toContain("customer-abcd1234");
      expect(text).toContain("[redacted]");
    }
    expect(shown).toContain("…1234");
    expect(shown).toContain(credentials.clientId);
    expect(shown).toContain("https://events.laylo.com/api");
  });

  it("redacts a key too short to mask", () => {
    const { laylo } = clientWith({ apiKey: "abc123" });

    expect(inspect(laylo)).toContain('apiKey: "[redacted]"');
  });

  it("shows a creator id in full, since it is not a credential", () => {
    const { laylo } = clientWith({ creatorId: "roster-user" });

    expect(inspect(laylo)).toContain('creatorId: "roster-user"');
    expect(inspect(laylo)).toContain("apiKey: undefined");
    expect(JSON.parse(JSON.stringify(laylo))).toMatchObject({
      creatorId: "roster-user",
      clientSecret: "[redacted]",
    });
  });
});
