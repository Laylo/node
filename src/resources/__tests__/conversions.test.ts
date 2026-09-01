import { describe, expect, expectTypeOf, it } from "vitest";

import { BadRequestError, LayloConfigurationError } from "../../core/errors.js";
import type { Page } from "../../core/pagination.js";
import type {
  Conversion,
  FanConversion,
  TrackConversionResponse,
} from "../../types.js";
import { Conversions } from "../conversions.js";
import { fakeContext, headersOf, json, type Call } from "./harness.js";

const bodyOf = (call: Call | undefined): Record<string, unknown> =>
  JSON.parse(call?.init.body as string) as Record<string, unknown>;

const conversion = (overrides: Partial<Conversion> = {}): Conversion => ({
  action: "TICKET_PURCHASE",
  id: "creator_123:TICKET_PURCHASE:vip_ticket",
  name: "VIP ticket",
  ...overrides,
});

const fanConversion = (fanId: string): FanConversion => ({
  conversion: conversion(),
  event: {
    action: "TICKET_PURCHASE",
    count: 1,
    createdAt: 1_722_500_000_000,
    id: `event_${fanId}`,
    name: "VIP ticket",
  },
  fan: { id: fanId },
});

const eventsPage = (
  fanIds: string[],
  pageInfo: { has_more: boolean; next_cursor: string | null },
) =>
  json(200, {
    data: { conversions: fanIds.map(fanConversion) },
    page_info: pageInfo,
  });

describe("Conversions", () => {
  describe("list", () => {
    it("issues GET /v1/conversions with no query when called bare", async () => {
      const { context, apiCalls } = fakeContext([json(200, [conversion()])], {
        apiKey: "customer-key-1",
      });

      const conversions = await new Conversions(context).list();

      expect(conversions).toEqual([conversion()]);
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

    it("returns the typed conversion array", () => {
      const { context } = fakeContext([], { apiKey: "customer-key-1" });

      expectTypeOf(new Conversions(context).list()).resolves.toEqualTypeOf<
        Conversion[]
      >();
    });
  });

  describe("definitions.create", () => {
    it("POSTs the definition and unwraps the conversion envelope", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { conversion: conversion(), status: "success" })],
        { apiKey: "customer-key-1" },
      );

      const created = await new Conversions(context).definitions.create({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
        relatedProductId: "drop_123",
      });

      expect(created).toEqual(conversion());
      expectTypeOf(created).toEqualTypeOf<Conversion>();
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/conversions/definitions",
      );
      expect(call?.init.method).toBe("POST");
      expect(bodyOf(call)).toEqual({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
        relatedProductId: "drop_123",
      });
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

      const failure: unknown = await new Conversions(context).definitions
        .create({ action: "TICKET_PURCHASE", name: "" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestError);
      expect((failure as BadRequestError).message).toBe(
        "name must not be empty",
      );
    });
  });

  describe("definitions.retrieve", () => {
    it("issues GET /v1/conversions/definitions with action and name and unwraps the envelope", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { conversion: conversion() })],
        { apiKey: "customer-key-1" },
      );

      const retrieved = await new Conversions(context).definitions.retrieve({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
      });

      expect(retrieved).toEqual(conversion());
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/conversions/definitions?action=TICKET_PURCHASE&name=VIP+ticket",
      );
      expect(call?.init.method).toBe("GET");
    });
  });

  describe("events.list", () => {
    it("issues GET /v1/conversions/events and wraps the conversions collection in a Page", async () => {
      const { context, apiCalls } = fakeContext(
        [eventsPage(["fan_1", "fan_2"], { has_more: false, next_cursor: null })],
        { apiKey: "customer-key-1" },
      );

      const page = await new Conversions(context).events.list({
        action: "TICKET_PURCHASE",
        name: "VIP ticket",
        limit: 2,
      });

      expect(page.data).toEqual([fanConversion("fan_1"), fanConversion("fan_2")]);
      expect(page.hasMore).toBe(false);
      expectTypeOf(page).toEqualTypeOf<Page<FanConversion>>();
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/conversions/events?action=TICKET_PURCHASE&name=VIP+ticket&limit=2",
      );
    });

    it("re-sends action, name, and limit with the new cursor and the same apiKey on nextPage", async () => {
      const { context, apiCalls } = fakeContext(
        [
          eventsPage(["fan_1"], { has_more: true, next_cursor: "NTA" }),
          eventsPage(["fan_2"], { has_more: false, next_cursor: null }),
        ],
        { apiKey: "default-key" },
      );

      const page = await new Conversions(context).events.list(
        { action: "TICKET_PURCHASE", name: "VIP ticket", limit: 1 },
        { apiKey: "override-key" },
      );
      const next = await page.nextPage();

      expect(next?.data).toEqual([fanConversion("fan_2")]);
      const [, secondCall] = apiCalls();
      expect(secondCall?.url).toBe(
        "https://api.example.test/api/v1/conversions/events?action=TICKET_PURCHASE&name=VIP+ticket&limit=1&cursor=NTA",
      );
      expect(secondCall && headersOf(secondCall).get("x-api-key")).toBe(
        "override-key",
      );
    });

    it("rejects an out-of-range limit before any request", async () => {
      const { context, apiCalls } = fakeContext([], {
        apiKey: "customer-key-1",
      });

      const failure: unknown = await new Conversions(context).events
        .list({ action: "TICKET_PURCHASE", name: "VIP ticket", limit: 0 })
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
      expect(bodyOf(call).timestamp).toBe(
        "2026-08-25T12:30:00.000Z",
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
