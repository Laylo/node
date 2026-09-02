import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { LayloConfigurationError } from "../../core/errors.js";
import type { Contact, SegmentConfiguration } from "../../types.js";
import { Fans } from "../fans.js";
import { bodyOf, fakeContext, headersOf, json } from "./harness.js";

describe("Fans", () => {
  describe("segments.count", () => {
    it("issues POST /v1/fans/segments/search and unwraps numberOfFans", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { numberOfFans: 42 })],
        { apiKey: "customer-key-1" },
      );

      const numberOfFans = await new Fans(context).segments.count({
        signUpType: "sms",
      });

      expect(numberOfFans).toBe(42);
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/fans/segments/search",
      );
      expect(call?.init.method).toBe("POST");
      expect(call && headersOf(call).get("authorization")).toBe(
        "Bearer integrator-token",
      );
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
      expect(bodyOf(call)).toEqual({
        signUpType: "sms",
      });
    });

    it("serializes nested location filters untouched", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { numberOfFans: 7 })],
        { apiKey: "customer-key-1" },
      );
      const configuration: SegmentConfiguration = {
        signUpType: "email",
        dropIds: ["drop-1"],
        excludedDropIds: ["drop-2"],
        conversionIds: ["conv-1"],
        excludedConversionIds: ["conv-2"],
        locations: [
          { city: "Austin", state: "TX", country: "US", radius: 50 },
          { state: "NY", country: "US" },
          { country: "CA" },
        ],
        excludedLocations: [{ country: "FR" }],
      };

      await new Fans(context).segments.count(configuration);

      const [call] = apiCalls();
      expect(bodyOf(call)).toEqual(configuration);
    });

    it("resolves to a number", () => {
      const { context } = fakeContext([], { apiKey: "customer-key-1" });

      expectTypeOf(
        new Fans(context).segments.count({ signUpType: "sms" }),
      ).resolves.toEqualTypeOf<number>();
    });
  });

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
});
