import { vi } from "vitest";

import { TokenProvider } from "../../core/auth.js";
import { customerFrom } from "../../core/customer.js";
import { HttpClient } from "../../core/http.js";
import type { ResourceContext } from "../base.js";

export type Call = { url: string; init: RequestInit };

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const drop = (id: string) => ({
  id,
  title: "New album",
  description: null,
  imageUrl: null,
  isMultidrop: false,
  dropDayMessage: null,
  endDate: null,
  createdAt: 1_722_500_000_000,
});

// The provider mints lazily, so the token response is queued first and
// calls[0] is always the mint; apiCalls() is everything after it.
export const fakeContext = (
  responses: Response[],
  options: { apiKey?: string; creatorId?: string } = {},
) => {
  const calls: Call[] = [];
  const queue = [
    json(200, {
      access_token: "integrator-token",
      token_type: "Bearer",
      expires_in: 3600,
    }),
    ...responses,
  ];
  const fetch = vi.fn((input: string, init?: RequestInit) => {
    calls.push({ url: input, init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) {
      return Promise.reject(new Error("fake fetch ran out of responses"));
    }
    return Promise.resolve(next);
  }) as unknown as typeof globalThis.fetch;

  const http = new HttpClient({
    baseUrl: "https://api.example.test/api",
    fetch,
    timeoutMs: 5_000,
    userAgent: "laylo-node/test",
  });
  const tokens = new TokenProvider({
    userId: "user-1",
    accessKey: "access-key-1",
    secretKey: "shh-integrator-secret",
    http,
  });
  const context: ResourceContext = {
    http,
    tokens,
    customer: customerFrom(options),
  };
  return { context, calls, apiCalls: () => calls.slice(1) };
};

export const headersOf = (call: Call) => new Headers(call.init.headers);

export const bodyOf = (call: Call | undefined): Record<string, unknown> =>
  JSON.parse(call?.init.body as string) as Record<string, unknown>;
