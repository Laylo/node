import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  BadRequestError,
  LayloConfigurationError,
  NotFoundError,
  ServerError,
} from "../../core/errors.js";
import type { Contact, SubscribeFanResponse } from "../../types.js";
import { Fans, type CountFansInput, type SubscribeFanInput } from "../fans.js";
import { bodyOf, fakeContext, headersOf, json } from "./harness.js";

describe("Fans", () => {
  describe("isSubscribed", () => {
    it("issues POST /v1/fans/subscribed and unwraps isSubscribed", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { isSubscribed: true })],
        { apiKey: "customer-key-1" },
      );

      const isSubscribed = await new Fans(context).isSubscribed({
        email: "fan@example.invalid",
      });

      expect(isSubscribed).toBe(true);
      const [call] = apiCalls();
      expect(call?.url).toBe("https://api.example.test/api/v1/fans/subscribed");
      expect(call?.init.method).toBe("POST");
      expect(call && headersOf(call).get("authorization")).toBe(
        "Bearer integrator-token",
      );
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
      expect(bodyOf(call)).toEqual({
        email: "fan@example.invalid",
      });
    });

    it("accepts a phone contact", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { isSubscribed: false })],
        { apiKey: "customer-key-1" },
      );

      const isSubscribed = await new Fans(context).isSubscribed({
        phone: "+12025550100",
      });

      expect(isSubscribed).toBe(false);
      const [call] = apiCalls();
      expect(bodyOf(call)).toEqual({
        phone: "+12025550100",
      });
    });

    it("resolves to a boolean", () => {
      const { context } = fakeContext([], { apiKey: "customer-key-1" });

      expectTypeOf(
        new Fans(context).isSubscribed({ email: "fan@example.invalid" }),
      ).resolves.toEqualTypeOf<boolean>();
    });

    it("retries a 503 and returns the second response's value", async () => {
      vi.useFakeTimers();
      try {
        const { context } = fakeContext(
          [json(503, {}), json(200, { isSubscribed: true })],
          { apiKey: "customer-key-1" },
        );
        const result = new Fans(context).isSubscribed({
          phone: "+12025550100",
        });

        await vi.runAllTimersAsync();

        await expect(result).resolves.toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("isUnsubscribed", () => {
    it("issues POST /v1/fans/unsubscribed and unwraps isUnsubscribed", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { isUnsubscribed: true })],
        { apiKey: "customer-key-1" },
      );

      const isUnsubscribed = await new Fans(context).isUnsubscribed({
        phone: "+12025550100",
      });

      expect(isUnsubscribed).toBe(true);
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/fans/unsubscribed",
      );
      expect(call?.init.method).toBe("POST");
      expect(bodyOf(call)).toEqual({
        phone: "+12025550100",
      });
    });

    it("resolves to a boolean", () => {
      const { context } = fakeContext([], { apiKey: "customer-key-1" });

      expectTypeOf(
        new Fans(context).isUnsubscribed({ phone: "+12025550100" }),
      ).resolves.toEqualTypeOf<boolean>();
    });
  });

  describe("contact validation", () => {
    it("rejects an empty contact before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).isSubscribed({} as Contact),
      ).rejects.toThrow(LayloConfigurationError);
      expect(calls).toHaveLength(0);
    });

    it("rejects a contact with both email and phone before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).isUnsubscribed({
          email: "fan@example.invalid",
          phone: "+12025550100",
        } as unknown as Contact),
      ).rejects.toThrow(/exactly one/i);
      expect(calls).toHaveLength(0);
    });

    it("accepts an email contact with phone explicitly null", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { isSubscribed: true })],
        { apiKey: "customer-key-1" },
      );
      const contact = { email: "fan@example.invalid", phone: null };

      await new Fans(context).isSubscribed(contact);

      const [call] = apiCalls();
      expect(bodyOf(call)).toEqual(contact);
    });

    it("accepts a phone contact with email explicitly null", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { isUnsubscribed: true })],
        { apiKey: "customer-key-1" },
      );
      const contact = { phone: "+12025550100", email: null };

      await new Fans(context).isUnsubscribed(contact);

      const [call] = apiCalls();
      expect(bodyOf(call)).toEqual(contact);
    });

    it("rejects undefined and null contacts before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).isSubscribed(undefined as unknown as Contact),
      ).rejects.toThrow(LayloConfigurationError);
      await expect(
        new Fans(context).isSubscribed(null as unknown as Contact),
      ).rejects.toThrow(LayloConfigurationError);
      expect(calls).toHaveLength(0);
    });
  });

  describe("segments.count", () => {
    it("issues GET /v1/fans/segments with signUpType and unwraps numberOfFans", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { numberOfFans: 42 })],
        { apiKey: "customer-key-1" },
      );

      const count = await new Fans(context).segments.count({
        signUpType: "sms",
      });

      expect(count).toBe(42);
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/fans/segments?signUpType=sms",
      );
      expect(call?.init.method).toBe("GET");
      expect(call && headersOf(call).get("authorization")).toBe(
        "Bearer integrator-token",
      );
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
      expect(call?.init.body).toBeUndefined();
    });

    it("repeats id filters, JSON-encodes locations, and serializes Date bounds", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { numberOfFans: 7 })],
        { apiKey: "customer-key-1" },
      );

      await new Fans(context).segments.count({
        signUpType: "email",
        dropIds: ["drop_1", "drop_2"],
        excludedDropIds: ["drop_3"],
        conversionIds: ["conv_1"],
        excludedConversionIds: ["conv_2", "conv_3"],
        locations: [{ country: "US" }, { country: "US", state: "NY" }],
        excludedLocations: [
          { country: "CA", state: "ON", city: "Toronto", radius: 25 },
        ],
        signedUpAfter: new Date("2026-01-01T00:00:00.000Z"),
        signedUpBefore: "2026-09-01T00:00:00Z",
      });

      const [call] = apiCalls();
      const url = new URL(call?.url ?? "");
      expect(url.pathname).toBe("/api/v1/fans/segments");
      expect(url.searchParams.get("signUpType")).toBe("email");
      expect(url.searchParams.getAll("dropIds")).toEqual(["drop_1", "drop_2"]);
      expect(url.searchParams.getAll("excludedDropIds")).toEqual(["drop_3"]);
      expect(url.searchParams.getAll("conversionIds")).toEqual(["conv_1"]);
      expect(url.searchParams.getAll("excludedConversionIds")).toEqual([
        "conv_2",
        "conv_3",
      ]);
      expect(url.searchParams.getAll("locations")).toEqual([
        '{"country":"US"}',
        '{"country":"US","state":"NY"}',
      ]);
      expect(url.searchParams.getAll("excludedLocations")).toEqual([
        '{"country":"CA","state":"ON","city":"Toronto","radius":25}',
      ]);
      expect(url.searchParams.get("signedUpAfter")).toBe(
        "2026-01-01T00:00:00.000Z",
      );
      expect(url.searchParams.get("signedUpBefore")).toBe(
        "2026-09-01T00:00:00Z",
      );
    });

    it("sends no key for an empty id filter", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { numberOfFans: 0 })],
        { apiKey: "customer-key-1" },
      );

      await new Fans(context).segments.count({
        signUpType: "sms",
        dropIds: [],
        locations: [],
      });

      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/fans/segments?signUpType=sms",
      );
    });

    it("resolves to a number", () => {
      const { context } = fakeContext([], { apiKey: "customer-key-1" });

      expectTypeOf(
        new Fans(context).segments.count({ signUpType: "sms" }),
      ).resolves.toEqualTypeOf<number>();
    });

    it("rejects a missing or unknown signUpType before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).segments.count({} as CountFansInput),
      ).rejects.toThrow(LayloConfigurationError);
      await expect(
        new Fans(context).segments.count({
          signUpType: "fax",
        } as unknown as CountFansInput),
      ).rejects.toThrow(/signUpType/);
      await expect(
        new Fans(context).segments.count(
          undefined as unknown as CountFansInput,
        ),
      ).rejects.toThrow(LayloConfigurationError);
      expect(calls).toHaveLength(0);
    });

    it("rejects an invalid Date bound before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).segments.count({
          signUpType: "sms",
          signedUpBefore: new Date("nope"),
        }),
      ).rejects.toThrow(/signedUpBefore/);
      expect(calls).toHaveLength(0);
    });

    it("surfaces a 400 for an inverted sign-up window as BadRequestError", async () => {
      const { context } = fakeContext(
        [
          json(400, {
            error: {
              code: "BAD_REQUEST",
              message:
                "Invalid sign-up date range: 'signedUpAfter' must be before 'signedUpBefore'",
            },
          }),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Fans(context).segments
        .count({
          signUpType: "sms",
          signedUpAfter: "2026-09-01T00:00:00Z",
          signedUpBefore: "2026-01-01T00:00:00Z",
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestError);
    });

    it("retries a 503 like any other read", async () => {
      vi.useFakeTimers();
      try {
        const { context } = fakeContext(
          [json(503, {}), json(200, { numberOfFans: 3 })],
          { apiKey: "customer-key-1" },
        );
        const result = new Fans(context).segments.count({ signUpType: "sms" });

        await vi.runAllTimersAsync();

        await expect(result).resolves.toBe(3);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("subscribe", () => {
    const subscribed: SubscribeFanResponse = {
      fan: { id: "fan_123" },
      subscribed: true,
    };

    it("POSTs /v1/fans/subscriptions for an email fan and returns the full body", async () => {
      const { context, apiCalls } = fakeContext([json(200, subscribed)], {
        apiKey: "customer-key-1",
      });

      const result = await new Fans(context).subscribe({
        email: "fan@example.invalid",
        emailMarketingConsent: true,
        consentGrantedAt: "2026-08-25T12:30:00-07:00",
      });

      expect(result).toEqual(subscribed);
      expectTypeOf(result).toEqualTypeOf<SubscribeFanResponse>();
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/fans/subscriptions",
      );
      expect(call?.init.method).toBe("POST");
      expect(call && headersOf(call).get("authorization")).toBe(
        "Bearer integrator-token",
      );
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
      expect(bodyOf(call)).toEqual({
        email: "fan@example.invalid",
        emailMarketingConsent: true,
        consentGrantedAt: "2026-08-25T12:30:00-07:00",
      });
    });

    it("serializes a Date consentGrantedAt as an ISO string and passes dropId through", async () => {
      const withRsvp: SubscribeFanResponse = {
        ...subscribed,
        rsvp: { dropId: "drop_123", status: "confirmed" },
      };
      const { context, apiCalls } = fakeContext([json(200, withRsvp)], {
        apiKey: "customer-key-1",
      });

      const result = await new Fans(context).subscribe({
        phone: "+12025550100",
        smsMarketingConsent: true,
        consentGrantedAt: new Date("2026-08-25T19:30:00.000Z"),
        dropId: "drop_123",
      });

      expect(result.rsvp).toEqual({ dropId: "drop_123", status: "confirmed" });
      const [call] = apiCalls();
      expect(bodyOf(call)).toEqual({
        phone: "+12025550100",
        smsMarketingConsent: true,
        consentGrantedAt: "2026-08-25T19:30:00.000Z",
        dropId: "drop_123",
      });
    });

    it("rejects an invalid Date consentGrantedAt before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).subscribe({
          email: "fan@example.invalid",
          emailMarketingConsent: true,
          consentGrantedAt: new Date("not a date"),
        }),
      ).rejects.toThrow(/consentGrantedAt/);
      expect(calls).toHaveLength(0);
    });

    it("rejects a fan with both or neither channel before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Fans(context).subscribe({
          email: "fan@example.invalid",
          phone: "+12025550100",
          emailMarketingConsent: true,
          consentGrantedAt: "2026-08-25T12:30:00Z",
        } as unknown as SubscribeFanInput),
      ).rejects.toThrow(/exactly one/i);
      await expect(
        new Fans(context).subscribe({
          emailMarketingConsent: true,
          consentGrantedAt: "2026-08-25T12:30:00Z",
        } as unknown as SubscribeFanInput),
      ).rejects.toThrow(LayloConfigurationError);
      expect(calls).toHaveLength(0);
    });

    it("accepts the other channel explicitly null", async () => {
      const { context, apiCalls } = fakeContext([json(200, subscribed)], {
        apiKey: "customer-key-1",
      });

      await new Fans(context).subscribe({
        email: "fan@example.invalid",
        phone: null,
        emailMarketingConsent: true,
        consentGrantedAt: "2026-08-25T12:30:00Z",
      });

      const [call] = apiCalls();
      expect(bodyOf(call)).toEqual({
        email: "fan@example.invalid",
        phone: null,
        emailMarketingConsent: true,
        consentGrantedAt: "2026-08-25T12:30:00Z",
      });
    });

    it("surfaces a 400 for missing consent as BadRequestError with the server message intact", async () => {
      const { context } = fakeContext(
        [
          json(400, {
            error: {
              code: "BAD_REQUEST",
              message:
                "Subscribing an email requires 'emailMarketingConsent' to be true",
            },
          }),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Fans(context)
        .subscribe({
          email: "fan@example.invalid",
          emailMarketingConsent: false,
          consentGrantedAt: "2026-08-25T12:30:00Z",
        } as unknown as SubscribeFanInput)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestError);
      expect((failure as BadRequestError).message).toBe(
        "Subscribing an email requires 'emailMarketingConsent' to be true",
      );
    });

    it("surfaces an unknown dropId as NotFoundError", async () => {
      const { context } = fakeContext(
        [
          json(404, {
            error: { code: "NOT_FOUND", message: "Drop not found" },
          }),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Fans(context)
        .subscribe({
          email: "fan@example.invalid",
          emailMarketingConsent: true,
          consentGrantedAt: "2026-08-25T12:30:00Z",
          dropId: "drop_missing",
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(NotFoundError);
    });

    it("does not replay a 503 because the write is not idempotent", async () => {
      const { context, apiCalls } = fakeContext(
        [
          json(503, {
            error: { code: "SERVICE_UNAVAILABLE", message: "try later" },
          }),
          json(200, subscribed),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Fans(context)
        .subscribe({
          email: "fan@example.invalid",
          emailMarketingConsent: true,
          consentGrantedAt: "2026-08-25T12:30:00Z",
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerError);
      expect(apiCalls()).toHaveLength(1);
    });
  });
});
