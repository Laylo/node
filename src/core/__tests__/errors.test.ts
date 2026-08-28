import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  LayloAPIError,
  LayloConfigurationError,
  LayloConnectionError,
  LayloError,
  LayloTimeoutError,
  MethodNotAllowedError,
  NotFoundError,
  NotImplementedError,
  PermissionError,
  RateLimitError,
  ServerError,
} from "../errors.js";

const response = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers });
};

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: `${code} happened`, ...extra },
});

describe("LayloError", () => {
  it("sets name per subclass and keeps cause", () => {
    const cause = new Error("root");
    const error = new LayloConnectionError("boom", { cause });

    expect(error.name).toBe("LayloConnectionError");
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(LayloError);
    expect(error).toBeInstanceOf(Error);
    expect(new LayloTimeoutError("t").name).toBe("LayloTimeoutError");
    expect(new LayloConfigurationError("c").name).toBe(
      "LayloConfigurationError",
    );
  });

  it("matches instanceof across a duplicated class identity", () => {
    // Simulate the CJS build's copy of the class: a different constructor
    // that records the same chain of kinds.
    const foreign = new Error("foreign") as Error & Record<symbol, unknown>;
    foreign[Symbol.for("laylo.node.errorKinds")] = [
      "NotFoundError",
      "LayloAPIError",
      "LayloError",
    ];

    expect(foreign instanceof LayloError).toBe(true);
    expect(foreign instanceof LayloAPIError).toBe(true);
    expect(foreign instanceof NotFoundError).toBe(true);
    expect(foreign instanceof RateLimitError).toBe(false);
  });

  it("does not let a consumer subclass borrow an SDK class's identity", () => {
    class NotFoundError extends LayloAPIError {}
    const consumer = new NotFoundError({
      status: 404,
      code: "NOT_FOUND",
      message: "nope",
      headers: new Headers(),
      raw: undefined,
    });
    const sdk = LayloAPIError.fromResponse(
      new Response("{}", { status: 404 }),
      {},
    );

    expect(consumer instanceof LayloAPIError).toBe(true);
    expect(consumer instanceof NotFoundError).toBe(true);
    expect(sdk instanceof NotFoundError).toBe(false);
  });

  it("still matches its SDK ancestors when the constructor is renamed", () => {
    const Minified = class extends LayloTimeoutError {};
    Object.defineProperty(Minified, "name", { value: "a" });
    const error = new Minified("t");

    expect(error instanceof LayloTimeoutError).toBe(true);
    expect(error instanceof LayloError).toBe(true);
  });

  it("rejects values that are not errors", () => {
    const values: unknown[] = [null, "nope", {}];
    for (const value of values) {
      expect(value instanceof LayloError).toBe(false);
    }
    expect(
      { [Symbol.for("laylo.node.errorKinds")]: "LayloError" } instanceof
        LayloError,
    ).toBe(false);
  });
});

describe("LayloAPIError.fromResponse", () => {
  it.each([
    [400, BadRequestError],
    [401, AuthenticationError],
    [403, PermissionError],
    [404, NotFoundError],
    [405, MethodNotAllowedError],
    [409, ConflictError],
    [429, RateLimitError],
    [501, NotImplementedError],
    [500, ServerError],
    [502, ServerError],
    [503, ServerError],
    [504, ServerError],
    [418, LayloAPIError],
  ])("maps %i to %o", (status, cls) => {
    const body = envelope("SOME_CODE", { details: { field: "x" } });
    const error = LayloAPIError.fromResponse(
      response(status, body, { "x-amzn-requestid": "req-1" }),
      body,
    );

    expect(error).toBeInstanceOf(cls);
    expect(error).toBeInstanceOf(LayloAPIError);
    expect(error).toBeInstanceOf(LayloError);
    expect(error.name).toBe(cls.name);
    expect(error.status).toBe(status);
    expect(error.code).toBe("SOME_CODE");
    expect(error.message).toBe("SOME_CODE happened");
    expect(error.details).toEqual({ field: "x" });
    expect(error.requestId).toBe("req-1");
    expect(error.headers).toBeInstanceOf(Headers);
    expect(error.raw).toEqual(body);
  });

  it("falls back to x-request-id and leaves requestId undefined otherwise", () => {
    const body = envelope("X");
    expect(
      LayloAPIError.fromResponse(
        response(400, body, { "x-request-id": "req-2" }),
        body,
      ).requestId,
    ).toBe("req-2");
    expect(
      LayloAPIError.fromResponse(response(400, body), body).requestId,
    ).toBeUndefined();
  });

  it("leaves details undefined when the envelope has none", () => {
    const body = envelope("X");
    const error = LayloAPIError.fromResponse(response(400, body), body);

    expect(error.details).toBeUndefined();
    expect("details" in error).toBe(true);
  });

  it("handles non-JSON bodies with an UNKNOWN code and truncated message", () => {
    const html = `<html>\n  <body>${"Bad gateway ".repeat(40)}</body></html>`;
    const error = LayloAPIError.fromResponse(response(502, html), html);

    expect(error).toBeInstanceOf(ServerError);
    expect(error.code).toBe("UNKNOWN");
    expect(error.message.length).toBeLessThanOrEqual(201);
    expect(error.message.endsWith("…")).toBe(true);
    expect(error.message).not.toContain("\n");
    expect(error.raw).toBe(html);
  });

  it("keeps short text bodies intact", () => {
    const error = LayloAPIError.fromResponse(
      response(503, "  Service Unavailable  "),
      "  Service Unavailable  ",
    );

    expect(error.message).toBe("Service Unavailable");
  });

  it("describes empty and malformed bodies by status", () => {
    expect(
      LayloAPIError.fromResponse(response(500, ""), undefined).message,
    ).toBe("Request failed with status 500");
    expect(LayloAPIError.fromResponse(response(500, "  "), "  ").message).toBe(
      "Request failed with status 500",
    );
    expect(
      LayloAPIError.fromResponse(response(500, {}), { error: null }).message,
    ).toBe("Request failed with status 500");
    expect(
      LayloAPIError.fromResponse(response(500, {}), { unrelated: true })
        .message,
    ).toBe("Request failed with status 500");
    expect(LayloAPIError.fromResponse(response(500, {}), [1]).message).toBe(
      "Request failed with status 500",
    );
  });

  it("reads gateway-style bodies that skip the error envelope", () => {
    const gateway = { message: "Missing Authentication Token" };
    const fromGateway = LayloAPIError.fromResponse(
      response(403, gateway),
      gateway,
    );
    expect(fromGateway).toBeInstanceOf(PermissionError);
    expect(fromGateway.code).toBe("UNKNOWN");
    expect(fromGateway.message).toBe("Missing Authentication Token");

    const withCode = { code: "THROTTLED", message: "Too Many Requests" };
    const throttled = LayloAPIError.fromResponse(
      response(429, withCode),
      withCode,
    );
    expect(throttled.code).toBe("THROTTLED");
    expect(throttled.message).toBe("Too Many Requests");

    const stringError = { error: "nope" };
    expect(
      LayloAPIError.fromResponse(response(500, stringError), stringError)
        .message,
    ).toBe("nope");

    const numericError = { error: 42 };
    expect(
      LayloAPIError.fromResponse(response(500, numericError), numericError)
        .message,
    ).toBe("Request failed with status 500");
  });

  it("includes the code in the message when the envelope has no message", () => {
    const body = { error: { code: "NO_MESSAGE", message: "" } };
    const error = LayloAPIError.fromResponse(response(400, body), body);

    expect(error.code).toBe("NO_MESSAGE");
    expect(error.message).toBe("Request failed with status 400 (NO_MESSAGE)");

    const codeless = { error: { code: "", message: 42 } };
    expect(
      LayloAPIError.fromResponse(response(400, codeless), codeless).message,
    ).toBe("Request failed with status 400");
  });

  describe("AuthenticationError", () => {
    it("carries apiKeyStatus when the body says the key is invalid", () => {
      const body = envelope("UNAUTHORIZED", { apiKeyStatus: "invalid" });
      const error = LayloAPIError.fromResponse(response(401, body), body);

      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as AuthenticationError).apiKeyStatus).toBe("invalid");
    });

    it("leaves apiKeyStatus undefined otherwise", () => {
      const body = envelope("UNAUTHORIZED", { apiKeyStatus: "expired" });
      const error = LayloAPIError.fromResponse(
        response(401, body),
        body,
      ) as AuthenticationError;

      expect(error.apiKeyStatus).toBeUndefined();
    });
  });

  describe("RateLimitError", () => {
    it("prefers the Retry-After header", () => {
      const body = envelope("RATE_LIMITED", { details: { retryAfter: 5 } });
      const error = LayloAPIError.fromResponse(
        response(429, body, { "retry-after": "30" }),
        body,
      ) as RateLimitError;

      expect(error.retryAfter).toBe(30);
    });

    it("falls back to details.retryAfter", () => {
      const body = envelope("RATE_LIMITED", { details: { retryAfter: 5 } });
      const error = LayloAPIError.fromResponse(
        response(429, body),
        body,
      ) as RateLimitError;

      expect(error.retryAfter).toBe(5);
    });

    it("is undefined when neither is present or usable", () => {
      for (const body of [
        envelope("RATE_LIMITED"),
        envelope("RATE_LIMITED", { details: { retryAfter: "soon" } }),
        envelope("RATE_LIMITED", { details: null }),
        "Too Many Requests",
      ]) {
        const error = LayloAPIError.fromResponse(
          response(429, body),
          body,
        ) as RateLimitError;
        expect(error.retryAfter).toBeUndefined();
      }
    });
  });
});
