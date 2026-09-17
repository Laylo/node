import { describe, expect, expectTypeOf, it } from "vitest";

import { BadRequestError, LayloConfigurationError } from "../../core/errors.js";
import type { Conversion, TrackConversionResponse } from "../../types.js";
import { Conversions } from "../conversions.js";
import { bodyOf, fakeContext, headersOf, json } from "./harness.js";

const conversion = (overrides: Partial<Conversion> = {}): Conversion => ({
  action: "TICKET_PURCHASE",
  id: "creator_123:TICKET_PURCHASE:vip_ticket",
  name: "VIP ticket",
  ...overrides,
});

describe("Conversions", () => {
  describe("list", () => {
    it("issues GET /v1/conversions with no query when called bare", async () => {
      const { context, apiCalls } = fakeContext([json(200, [conversion()])], {
        apiKey: "customer-key-1",
      });

      const conversions = await new Conversions(context).list();

      expect(conversions).toEqual([conversion()]);
      expectTypeOf(conversions).toEqualTypeOf<Conversion[]>();
      const [call] = apiCalls();
      expect(call?.url).toBe("https://api.example.test/api/v1/conversions");
      expect(call?.init.method).toBe("GET");
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
      expect(call?.init.body).toBeUndefined();
    });

    it("sends a single action as one query key", async () => {
      const { context, apiCalls } = fakeContext([json(200, [])], {
        apiKey: "customer-key-1",
      });

      await new Conversions(context).list({
        action: "TICKET_PURCHASE",
        relatedProductId: "drop_123",
      });

      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/conversions?action=TICKET_PURCHASE&relatedProductId=drop_123",
      );
    });

    it("repeats the action key for an array", async () => {
      const { context, apiCalls } = fakeContext([json(200, [])], {
        apiKey: "customer-key-1",
      });

      await new Conversions(context).list({
        action: ["TICKET_PURCHASE", "RSVP"],
      });

      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/conversions?action=TICKET_PURCHASE&action=RSVP",
      );
    });

    it("rejects an empty action array before any request", async () => {
      const { context, apiCalls } = fakeContext([], {
        apiKey: "customer-key-1",
      });

      const failure: unknown = await new Conversions(context)
        .list({ action: [] })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LayloConfigurationError);
      expect(apiCalls()).toHaveLength(0);
    });
  });

  describe("events.track", () => {
    const trackedBody = {
      status: "success",
      tracked: {
        action: "TICKET_PURCHASE",
        metadata: { uniqueId: "order_123", currency: "USD", totalPrice: 59.5 },
        name: "VIP ticket",
        timestamp: "2026-08-25T12:30:00.000Z",
        user: { emailMarketingConsent: true, hasEmail: true, hasPhone: false },
      },
    };

    it("POSTs the event and keeps the full status envelope", async () => {
      const { context, apiCalls } = fakeContext([json(200, trackedBody)], {
        apiKey: "customer-key-1",
      });

      const receipt = await new Conversions(context).events.track({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
        timestamp: "2026-08-25T12:30:00.000Z",
        metadata: { uniqueId: "order_123", currency: "USD", totalPrice: 59.5 },
        user: { email: "fan@example.invalid", emailMarketingConsent: true },
      });

      expect(receipt).toEqual(trackedBody);
      expectTypeOf(receipt).toEqualTypeOf<TrackConversionResponse>();
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/conversions/events",
      );
      expect(call?.init.method).toBe("POST");
      expect(bodyOf(call).user).toEqual({
        email: "fan@example.invalid",
        emailMarketingConsent: true,
      });
    });

    it("serializes a Date timestamp as an ISO string", async () => {
      const { context, apiCalls } = fakeContext([json(200, trackedBody)], {
        apiKey: "customer-key-1",
      });

      await new Conversions(context).events.track({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
        timestamp: new Date("2026-08-25T12:30:00.000Z"),
        metadata: { uniqueId: "order_123" },
        user: { phone: "+12025550142", smsMarketingConsent: true },
      });

      const [call] = apiCalls();
      expect(bodyOf(call).timestamp).toBe("2026-08-25T12:30:00.000Z");
    });

    it("rejects an invalid Date timestamp before any request", async () => {
      const { context, apiCalls } = fakeContext([], {
        apiKey: "customer-key-1",
      });

      const failure: unknown = await new Conversions(context).events
        .track({
          action: "TICKET_PURCHASE",
          name: "VIP ticket",
          timestamp: new Date("not a date"),
          metadata: { uniqueId: "order_123" },
          user: { email: "fan@example.invalid" },
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LayloConfigurationError);
      expect(apiCalls()).toHaveLength(0);
    });

    it("surfaces a 400 as BadRequestError with the server message intact", async () => {
      const { context } = fakeContext(
        [
          json(400, {
            error: { code: "BAD_REQUEST", message: "name must not be empty" },
          }),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Conversions(context).events
        .track({
          action: "TICKET_PURCHASE",
          name: "",
          timestamp: "2026-08-25T12:30:00.000Z",
          metadata: { uniqueId: "order_123" },
          user: { email: "fan@example.invalid" },
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestError);
      expect((failure as BadRequestError).message).toBe(
        "name must not be empty",
      );
    });

    it("returns a failure status without throwing", async () => {
      const { context } = fakeContext(
        [json(200, { ...trackedBody, status: "failure" })],
        { apiKey: "customer-key-1" },
      );

      const receipt = await new Conversions(context).events.track({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
        timestamp: "2026-08-25T12:30:00.000Z",
        metadata: { uniqueId: "order_123" },
        user: { email: "fan@example.invalid" },
      });

      expect(receipt.status).toBe("failure");
    });
  });
});
