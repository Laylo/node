import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BadRequestError,
  LayloConfigurationError,
  LayloConnectionError,
  LayloTimeoutError,
  RateLimitError,
  ServerError,
} from "../errors.js";
import { HttpClient, type HttpClientOptions } from "../http.js";

type Call = { url: string; init: RequestInit };

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const fakeFetch = (
  responses: Array<Response | Error | (() => Promise<Response>)>,
) => {
  const calls: Call[] = [];
  const fetch = vi.fn((input: string, init?: RequestInit) => {
    calls.push({ url: input, init: init ?? {} });
    const next = responses.shift();
    if (next === undefined) {
      return Promise.reject(new Error("fake fetch ran out of responses"));
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    if (typeof next === "function") {
      return next();
    }
    return Promise.resolve(next);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

const client = (
  fetch: typeof globalThis.fetch,
  overrides: Partial<HttpClientOptions> = {},
) =>
  new HttpClient({
    baseUrl: "https://api.example.test/api",
    fetch,
    timeoutMs: 5_000,
    userAgent: "laylo-node/test",
    ...overrides,
  });

const headersOf = (call: Call) => new Headers(call.init.headers);

describe("HttpClient", () => {
  describe("headers", () => {
    it("sends Accept, User-Agent, and credentials as headers", async () => {
      const { fetch, calls } = fakeFetch([json(200, { ok: true })]);
      await client(fetch, { source: "my-app" }).request({
        method: "POST",
        path: "/v1/things",
        body: { a: 1 },
        headers: { "X-Custom": "yes" },
        auth: { bearer: "tok_123", apiKey: "key_456" },
      });

      const call = calls[0]!;
      const headers = headersOf(call);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("user-agent")).toBe("laylo-node/test");
      expect(headers.get("x-laylo-source")).toBe("my-app");
      expect(headers.get("authorization")).toBe("Bearer tok_123");
      expect(headers.get("x-api-key")).toBe("key_456");
      expect(headers.get("x-custom")).toBe("yes");
      expect(call.init.method).toBe("POST");
      expect(call.init.body).toBe('{"a":1}');
      expect(call.url).not.toContain("tok_123");
      expect(call.url).not.toContain("key_456");
    });

    it("omits optional headers and body when not provided", async () => {
      const { fetch, calls } = fakeFetch([json(200, {})]);
      await client(fetch).request({ method: "GET", path: "/v1/things" });

      const call = calls[0]!;
      const headers = headersOf(call);
      expect(headers.has("content-type")).toBe(false);
      expect(headers.has("x-laylo-source")).toBe(false);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("x-api-key")).toBe(false);
      expect(headers.has("x-creator-id")).toBe(false);
      expect("body" in call.init).toBe(false);
    });

    it("sends a creator id as X-Creator-Id", async () => {
      const { fetch, calls } = fakeFetch([json(200, { ok: true })]);
      await client(fetch).request({
        method: "GET",
        path: "/v1/drops",
        auth: { bearer: "tok_123", creatorId: "user_789" },
      });

      const headers = headersOf(calls[0]!);
      expect(headers.get("x-creator-id")).toBe("user_789");
      expect(headers.has("x-api-key")).toBe(false);
    });

    it("lets caller headers override defaults regardless of case", async () => {
      const { fetch, calls } = fakeFetch([json(200, {})]);
      await client(fetch).request({
        method: "GET",
        path: "/v1/export",
        headers: { accept: "text/csv", "user-agent": "custom/1" },
      });

      const headers = headersOf(calls[0]!);
      expect(headers.get("accept")).toBe("text/csv");
      expect(headers.get("user-agent")).toBe("custom/1");
    });

    it("accepts a fetch whose Response is not the global class", async () => {
      class ForeignResponse {
        status = 200;
        ok = true;
        headers = new Headers();
        text() {
          return Promise.resolve('{"ok":true}');
        }
      }
      const fetch = vi.fn(() =>
        Promise.resolve(new ForeignResponse() as unknown as Response),
      ) as unknown as typeof globalThis.fetch;
      const { data } = await client(fetch).request({
        method: "GET",
        path: "/v1/x",
      });

      expect(data).toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to the global fetch", async () => {
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(json(200, { ok: true }));
      try {
        const http = new HttpClient({
          baseUrl: "https://api.example.test",
          timeoutMs: 1_000,
          userAgent: "ua",
        });
        await expect(
          http.request({ method: "GET", path: "/v1/x" }),
        ).resolves.toMatchObject({ data: { ok: true } });
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("URL join", () => {
    it.each([
      ["https://api.example.test/api", "/v1/things"],
      ["https://api.example.test/api/", "/v1/things"],
      ["https://api.example.test/api", "v1/things"],
    ])("joins %s + %s without doubling slashes", async (baseUrl, path) => {
      const { fetch, calls } = fakeFetch([json(200, {})]);
      await client(fetch, { baseUrl }).request({ method: "GET", path });

      expect(calls[0]!.url).toBe("https://api.example.test/api/v1/things");
    });

    it("serializes the query, repeating array keys", async () => {
      const { fetch, calls } = fakeFetch([json(200, {})]);
      await client(fetch).request({
        method: "GET",
        path: "/v1/conversions",
        query: { action: ["PURCHASE", "RSVP"], limit: 10, cursor: undefined },
      });

      expect(calls[0]!.url).toBe(
        "https://api.example.test/api/v1/conversions?action=PURCHASE&action=RSVP&limit=10",
      );
    });

    it("leaves the URL bare when the query is empty", async () => {
      const { fetch, calls } = fakeFetch([json(200, {})]);
      await client(fetch).request({
        method: "GET",
        path: "/v1/conversions",
        query: { cursor: undefined },
      });

      expect(calls[0]!.url).toBe("https://api.example.test/api/v1/conversions");
    });

    it("rejects object query values before sending", async () => {
      const { fetch } = fakeFetch([]);
      await expect(
        client(fetch).request({
          method: "GET",
          path: "/v1/x",
          query: { filter: { a: 1 } },
        }),
      ).rejects.toBeInstanceOf(LayloConfigurationError);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("response parsing", () => {
    it("returns undefined for 204", async () => {
      const { fetch } = fakeFetch([new Response(null, { status: 204 })]);
      const { data, response } = await client(fetch).request({
        method: "DELETE",
        path: "/v1/x",
      });

      expect(data).toBeUndefined();
      expect(response.status).toBe(204);
    });

    it("returns undefined for an empty 200 body", async () => {
      const { fetch } = fakeFetch([new Response("", { status: 200 })]);
      const { data } = await client(fetch).request({
        method: "GET",
        path: "/v1/x",
      });

      expect(data).toBeUndefined();
    });

    it("returns text when a 2xx body is not JSON", async () => {
      const { fetch } = fakeFetch([new Response("pong", { status: 200 })]);
      const { data } = await client(fetch).request({
        method: "GET",
        path: "/v1/x",
      });

      expect(data).toBe("pong");
    });

    it("throws typed errors for non-2xx", async () => {
      const { fetch } = fakeFetch([
        json(400, { error: { code: "VALIDATION", message: "bad input" } }),
      ]);
      const error = await client(fetch)
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).code).toBe("VALIDATION");
      expect((error as BadRequestError).message).toBe("bad input");
    });
  });

  describe("timeouts and aborts", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const hangingFetch = () =>
      vi.fn(
        (_input: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(init.signal?.reason as Error);
            });
          }),
      ) as unknown as typeof globalThis.fetch;

    it("throws LayloTimeoutError when the timeout fires", async () => {
      const fetch = hangingFetch();
      const pending = client(fetch, { timeoutMs: 1_000 }).request({
        method: "GET",
        path: "/v1/slow",
      });
      const result = pending.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1_000);
      const error = await result;

      expect(error).toBeInstanceOf(LayloTimeoutError);
      expect((error as Error).message).toBe(
        "Request to GET /v1/slow timed out after 1000ms",
      );
      expect((error as Error).cause).toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("times out a body that never finishes", async () => {
      const fetch = vi.fn((_input: string, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"partial":'));
            init?.signal?.addEventListener("abort", () => {
              controller.error(init.signal?.reason as Error);
            });
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }) as unknown as typeof globalThis.fetch;
      const result = client(fetch, { timeoutMs: 1_000 })
        .request({ method: "GET", path: "/v1/slow-body" })
        .catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(await result).toBeInstanceOf(LayloTimeoutError);
    });

    it("treats a body read failure as a connection error", async () => {
      const broken = () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new TypeError("terminated"));
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      };
      const { fetch } = fakeFetch([broken, json(200, { ok: true })]);
      const result = client(fetch).request({ method: "GET", path: "/v1/x" });

      await vi.runAllTimersAsync();
      await expect(result).resolves.toMatchObject({ data: { ok: true } });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("uses the per-request timeout when given", async () => {
      const fetch = hangingFetch();
      const result = client(fetch, { timeoutMs: 60_000 })
        .request({ method: "GET", path: "/v1/slow", timeoutMs: 250 })
        .catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(250);
      expect(await result).toBeInstanceOf(LayloTimeoutError);
    });

    it("rethrows the caller's abort untouched", async () => {
      const fetch = hangingFetch();
      const controller = new AbortController();
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/slow", signal: controller.signal })
        .catch((e: unknown) => e);

      controller.abort();
      const error = await result;

      expect(error).not.toBeInstanceOf(LayloTimeoutError);
      expect((error as Error).name).toBe("AbortError");
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("retries", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, "random").mockReturnValue(0);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("retries 5xx with exponential backoff and then succeeds", async () => {
      const { fetch } = fakeFetch([
        json(503, {}),
        json(500, {}),
        json(200, { ok: true }),
      ]);
      const result = client(fetch).request({
        method: "PUT",
        path: "/v1/x",
        body: {},
      });

      await vi.advanceTimersByTimeAsync(499);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetch).toHaveBeenCalledTimes(3);
      await expect(result).resolves.toMatchObject({ data: { ok: true } });
    });

    it("honors Retry-After on 429", async () => {
      const { fetch } = fakeFetch([
        json(
          429,
          { error: { code: "RATE_LIMITED", message: "slow down" } },
          {
            "retry-after": "3",
          },
        ),
        json(200, { ok: true }),
      ]);
      const result = client(fetch).request({ method: "GET", path: "/v1/x" });

      await vi.advanceTimersByTimeAsync(2_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await expect(result).resolves.toMatchObject({ data: { ok: true } });
    });

    it("stops at maxRetries and throws the last error", async () => {
      const { fetch } = fakeFetch([
        json(429, { error: { code: "RATE_LIMITED", message: "slow down" } }),
        json(429, { error: { code: "RATE_LIMITED", message: "slow down" } }),
        json(429, { error: { code: "RATE_LIMITED", message: "slow down" } }),
        json(200, {}),
      ]);
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);

      await vi.runAllTimersAsync();
      expect(await result).toBeInstanceOf(RateLimitError);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("does not retry 400", async () => {
      const { fetch } = fakeFetch([
        json(400, { error: { code: "BAD", message: "no" } }),
        json(200, {}),
      ]);
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);

      await vi.runAllTimersAsync();
      expect(await result).toBeInstanceOf(BadRequestError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("retries network errors and wraps the final one", async () => {
      const { fetch } = fakeFetch([
        new TypeError("fetch failed"),
        new TypeError("fetch failed"),
        new TypeError("fetch failed"),
      ]);
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);

      await vi.runAllTimersAsync();
      const error = await result;
      expect(error).toBeInstanceOf(LayloConnectionError);
      expect((error as Error).message).toBe(
        "Request to GET /v1/x failed: fetch failed",
      );
      expect((error as Error).cause).toBeInstanceOf(TypeError);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("describes non-Error rejections", async () => {
      const { fetch } = fakeFetch([
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        () => Promise.reject("socket hang up"),
      ]);
      const result = client(fetch, { maxRetries: 0 })
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);

      expect(((await result) as Error).message).toBe(
        "Request to GET /v1/x failed: socket hang up",
      );
    });

    it("recovers after a network error", async () => {
      const { fetch } = fakeFetch([
        new TypeError("fetch failed"),
        json(200, { ok: true }),
      ]);
      const result = client(fetch).request({ method: "GET", path: "/v1/x" });

      await vi.runAllTimersAsync();
      await expect(result).resolves.toMatchObject({ data: { ok: true } });
    });

    it("does not replay a POST or PATCH after a retryable status", async () => {
      for (const method of ["POST", "PATCH"] as const) {
        const { fetch } = fakeFetch([json(503, {}), json(200, {})]);
        const result = client(fetch)
          .request({ method, path: "/v1/x", body: { a: 1 } })
          .catch((e: unknown) => e);

        await vi.runAllTimersAsync();
        expect(await result).toBeInstanceOf(ServerError);
        expect(fetch).toHaveBeenCalledTimes(1);
      }
    });

    it("retries a POST marked idempotent after a 503 and succeeds", async () => {
      const { fetch } = fakeFetch([json(503, {}), json(200, { ok: true })]);
      const result = client(fetch).request({
        method: "POST",
        path: "/v1/x",
        body: { a: 1 },
        idempotent: true,
      });

      await vi.runAllTimersAsync();
      await expect(result).resolves.toMatchObject({ data: { ok: true } });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("still retries a POST that never got a response", async () => {
      const { fetch } = fakeFetch([
        new TypeError("fetch failed"),
        json(200, { ok: true }),
      ]);
      const result = client(fetch).request({
        method: "POST",
        path: "/v1/x",
        body: { a: 1 },
      });

      await vi.runAllTimersAsync();
      await expect(result).resolves.toMatchObject({ data: { ok: true } });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("retries a POST or PATCH after a 429, which the server never processed", async () => {
      for (const method of ["POST", "PATCH"] as const) {
        const { fetch } = fakeFetch([json(429, {}), json(200, { ok: true })]);
        const result = client(fetch).request({
          method,
          path: "/v1/x",
          body: { a: 1 },
        });

        await vi.runAllTimersAsync();
        await expect(result).resolves.toMatchObject({ data: { ok: true } });
        expect(fetch).toHaveBeenCalledTimes(2);
      }
    });

    it("does not replay a POST whose body failed to read after headers arrived", async () => {
      const broken = () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("socket reset"));
              },
            }),
            { status: 201 },
          ),
        );
      const { fetch } = fakeFetch([broken, json(201, {})]);
      const result = client(fetch)
        .request({ method: "POST", path: "/v1/x", body: { a: 1 } })
        .catch((e: unknown) => e);

      await vi.runAllTimersAsync();
      expect(await result).toBeInstanceOf(LayloConnectionError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("gives up immediately when Retry-After exceeds the backoff cap", async () => {
      const { fetch } = fakeFetch([
        json(429, {}, { "retry-after": "3600" }),
        json(200, {}),
      ]);
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);

      await vi.runAllTimersAsync();
      const error = await result;
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(3600);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("rejects an unbuildable URL without fetching or retrying", async () => {
      const { fetch } = fakeFetch([]);
      await expect(
        client(fetch, { baseUrl: "not a url" }).request({
          method: "GET",
          path: "/v1/x",
        }),
      ).rejects.toBeInstanceOf(LayloConfigurationError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("detaches from the caller's signal after each attempt", async () => {
      const { fetch } = fakeFetch([json(503, {}), json(200, {})]);
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const result = client(fetch).request({
        method: "GET",
        path: "/v1/x",
        signal: controller.signal,
      });

      await vi.runAllTimersAsync();
      await expect(result).resolves.toMatchObject({ data: {} });
      expect(add.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
    });

    it("cuts the backoff wait short when the caller aborts", async () => {
      const { fetch } = fakeFetch([
        json(429, {}, { "retry-after": "5" }),
        json(200, {}),
      ]);
      const controller = new AbortController();
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/x", signal: controller.signal })
        .catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      const error = await result;

      expect((error as Error).name).toBe("AbortError");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("surfaces the caller's abort even when fetch reported something else", async () => {
      const { fetch } = fakeFetch([new TypeError("fetch failed")]);
      const controller = new AbortController();
      const result = client(fetch)
        .request({ method: "GET", path: "/v1/x", signal: controller.signal })
        .catch((e: unknown) => e);
      controller.abort();

      await vi.runAllTimersAsync();
      expect(((await result) as Error).name).toBe("AbortError");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("respects maxRetries and retry: false", async () => {
      const { fetch: f1 } = fakeFetch([json(503, {}), json(200, {})]);
      const r1 = client(f1, { maxRetries: 0 })
        .request({ method: "GET", path: "/v1/x" })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      expect(await r1).toBeInstanceOf(ServerError);
      expect(f1).toHaveBeenCalledTimes(1);

      const { fetch: f2 } = fakeFetch([json(503, {}), json(200, {})]);
      const r2 = client(f2)
        .request({ method: "GET", path: "/v1/x", retry: false })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      expect(await r2).toBeInstanceOf(ServerError);
      expect(f2).toHaveBeenCalledTimes(1);
    });
  });

  describe("bearer providers", () => {
    const stubProvider = () => ({
      getToken: vi.fn(() => Promise.resolve("provider-token-1")),
      invalidate: vi.fn(),
    });

    it("bounds the wait for a token by the request's own timeout", async () => {
      const provider = {
        getToken: vi.fn(() => new Promise<string>(() => {})),
        invalidate: vi.fn(),
      };
      const { fetch } = fakeFetch([]);

      const failure: unknown = await client(fetch)
        .request({
          method: "GET",
          path: "/v1/drops",
          timeoutMs: 20,
          auth: { bearer: provider, apiKey: "customer-key-1" },
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LayloTimeoutError);
      expect((failure as Error).message).toContain("GET /v1/drops");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("reports a bad base URL against the caller's request, before any mint", async () => {
      const provider = stubProvider();
      const { fetch } = fakeFetch([]);

      const failure: unknown = await client(fetch, { baseUrl: "not a url" })
        .request({
          method: "GET",
          path: "/v1/drops",
          auth: { bearer: provider, apiKey: "customer-key-1" },
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LayloConfigurationError);
      expect((failure as Error).message).toContain("GET /v1/drops");
      expect(provider.getToken).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
