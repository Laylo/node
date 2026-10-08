import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  LayloConfigurationError,
  LayloConnectionError,
  ServerError,
} from "../../core/errors.js";
import type {
  SegmentMessage,
  SendSmsRequest,
  SendSmsResponse,
} from "../../types.js";
import { Messages, type SendSegmentMessageInput } from "../messages.js";
import { bodyOf, fakeContext, headersOf, json } from "./harness.js";

const sent: SendSmsResponse = {
  queued: 1,
  skipped: [{ index: 1, reason: "not_subscribed" }],
};

describe("Messages", () => {
  describe("sms.send", () => {
    it("issues POST /v1/messages/sms and returns the response as is", async () => {
      const { context, apiCalls } = fakeContext([json(200, sent)], {
        apiKey: "customer-key-1",
      });

      const result = await new Messages(context).sms.send({
        message: "Presale starts now",
        to: ["+12025550100", "+12025550101"],
      });

      expect(result).toEqual(sent);
      const [call] = apiCalls();
      expect(call?.url).toBe("https://api.example.test/api/v1/messages/sms");
      expect(call?.init.method).toBe("POST");
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
      expect(bodyOf(call)).toEqual({
        message: "Presale starts now",
        to: ["+12025550100", "+12025550101"],
      });
    });

    it("sends a single phone number as a string", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { queued: 1, skipped: [] })],
        { creatorId: "creator-1" },
      );

      await new Messages(context).sms.send({
        message: "Hi",
        to: "+12025550100",
      });

      const [call] = apiCalls();
      expect(call && headersOf(call).get("x-creator-id")).toBe("creator-1");
      expect(bodyOf(call)).toEqual({ message: "Hi", to: "+12025550100" });
    });

    it("resolves to the endpoint's response type", () => {
      const { context } = fakeContext([], { apiKey: "customer-key-1" });

      expectTypeOf(
        new Messages(context).sms.send({ message: "Hi", to: "+12025550100" }),
      ).resolves.toEqualTypeOf<SendSmsResponse>();
    });

    it("accepts exactly 200 numbers", async () => {
      const { context, apiCalls } = fakeContext(
        [json(200, { queued: 200, skipped: [] })],
        { apiKey: "customer-key-1" },
      );

      await new Messages(context).sms.send({
        message: "Hi",
        to: Array<string>(200).fill("+12025550100"),
      });

      expect(apiCalls()).toHaveLength(1);
    });

    it("refuses an empty or oversized recipient list before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });
      const sms = new Messages(context).sms;

      await expect(sms.send({ message: "Hi", to: [] })).rejects.toThrow(
        LayloConfigurationError,
      );
      await expect(
        sms.send({
          message: "Hi",
          to: Array<string>(201).fill("+12025550100"),
        }),
      ).rejects.toThrow(/at most 200/);
      expect(calls).toHaveLength(0);
    });

    it("does not replay a 503 because the send is not idempotent", async () => {
      const { context, apiCalls } = fakeContext(
        [
          json(503, {
            error: { code: "SERVICE_UNAVAILABLE", message: "try later" },
          }),
          json(200, sent),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Messages(context).sms
        .send({ message: "Hi", to: "+12025550100" } satisfies SendSmsRequest)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerError);
      expect(apiCalls()).toHaveLength(1);
    });
  });

  describe("segments", () => {
    const channel = { credits: 0, creditsPerRecipient: 10, recipients: 0 };
    const created: SegmentMessage = {
      dryRun: false,
      estimate: {
        channels: {
          domesticSms: { ...channel, credits: 2400, recipients: 240 },
          emails: { ...channel, creditsPerRecipient: 1 },
          internationalSms: { ...channel, creditsPerRecipient: 25 },
        },
        costUsd: 4.8,
        credits: 2400,
        disclaimer: "This is an estimate.",
        recipients: 240,
        smsSegments: 1,
      },
      id: "4b0d3a8e-6f3c-4c1e-9a55-0f7e2d8c1b2a",
      note: "Message will start sending at sendAt, within the next few minutes",
      sendAt: "2026-11-20T19:05:00.000Z",
    };

    const presale: SendSegmentMessageInput = {
      message: "Presale starts now",
      segment: {
        signUpType: "sms",
        dropIds: ["drop_123"],
        locations: [{ city: "Los Angeles", state: "CA", country: "US" }],
      },
      timezone: "America/Los_Angeles",
    };

    it("send issues POST /v1/messages/segments with the body as given", async () => {
      const { context, apiCalls } = fakeContext([json(200, created)], {
        apiKey: "customer-key-1",
      });

      const result = await new Messages(context).segments.send(presale);

      expect(result).toEqual(created);
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/messages/segments",
      );
      expect(call?.init.method).toBe("POST");
      expect(call && headersOf(call).has("idempotency-key")).toBe(false);
      expect(bodyOf(call)).toEqual(presale);
    });

    it("schedule issues POST /v1/messages/segments/scheduled with sendAt untouched", async () => {
      const { context, apiCalls } = fakeContext([json(200, created)], {
        creatorId: "creator-1",
      });

      await new Messages(context).segments.schedule({
        message: "Tickets go on sale tomorrow",
        segment: { signUpType: "sms" },
        sendAt: "2026-11-20T19:00",
        timezone: "America/New_York",
      });

      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/messages/segments/scheduled",
      );
      expect(bodyOf(call)).toEqual({
        message: "Tickets go on sale tomorrow",
        segment: { signUpType: "sms" },
        sendAt: "2026-11-20T19:00",
        timezone: "America/New_York",
      });
    });

    it("sends a Date sign-up bound as its ISO string", async () => {
      const { context, apiCalls } = fakeContext([json(200, created)], {
        apiKey: "customer-key-1",
      });

      await new Messages(context).segments.send({
        ...presale,
        segment: {
          signUpType: "sms",
          signedUpAfter: new Date("2026-01-01T00:00:00Z"),
        },
      });

      expect(bodyOf(apiCalls()[0]).segment).toEqual({
        signUpType: "sms",
        signedUpAfter: "2026-01-01T00:00:00.000Z",
      });
    });

    it("refuses a segment that isn't sms before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });
      const segments = new Messages(context).segments;
      const emailSegment = {
        ...presale,
        segment: { signUpType: "email" },
      } as unknown as SendSegmentMessageInput;

      await expect(segments.send(emailSegment)).rejects.toThrow(
        LayloConfigurationError,
      );
      expect(calls).toHaveLength(0);
    });

    it("refuses both sign-up bounds before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });

      await expect(
        new Messages(context).segments.send({
          ...presale,
          segment: {
            signUpType: "sms",
            signedUpAfter: "2026-01-01T00:00:00Z",
            signedUpBefore: "2026-02-01T00:00:00Z",
          },
        }),
      ).rejects.toThrow(/can't be combined/);
      expect(calls).toHaveLength(0);
    });

    it("refuses a malformed idempotency key before any request", async () => {
      const { context, calls } = fakeContext([], { apiKey: "customer-key-1" });
      const segments = new Messages(context).segments;

      for (const idempotencyKey of [
        "",
        " ",
        "presale ",
        "line\nbreak",
        "x".repeat(256),
      ]) {
        await expect(
          segments.send(presale, { idempotencyKey }),
        ).rejects.toThrow(LayloConfigurationError);
      }
      expect(calls).toHaveLength(0);
    });

    it("treats a null idempotency key as absent", async () => {
      const { context, apiCalls } = fakeContext(
        [json(503, {}), json(200, created)],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Messages(context).segments
        .send(presale, { idempotencyKey: null })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerError);
      const [call] = apiCalls();
      expect(call && headersOf(call).has("idempotency-key")).toBe(false);
      expect(apiCalls()).toHaveLength(1);
    });

    it("replays a 409 from a keyed attempt that hasn't finished", async () => {
      vi.useFakeTimers();
      try {
        const { context, apiCalls } = fakeContext(
          [
            json(409, {
              error: {
                code: "CONFLICT",
                message:
                  "A request with this Idempotency-Key is still in progress",
              },
            }),
            json(200, created),
          ],
          { apiKey: "customer-key-1" },
        );
        const result = new Messages(context).segments.send(presale, {
          idempotencyKey: "presale-2026-11-20",
        });

        await vi.runAllTimersAsync();

        await expect(result).resolves.toEqual(created);
        expect(apiCalls()).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not resend after a dropped connection without a key", async () => {
      const { context, apiCalls } = fakeContext([], {
        apiKey: "customer-key-1",
      });

      await expect(
        new Messages(context).segments.send(presale),
      ).rejects.toBeInstanceOf(LayloConnectionError);
      expect(apiCalls()).toHaveLength(1);
    });

    it("replays a 503 on a dry run without a key", async () => {
      vi.useFakeTimers();
      try {
        const { context, apiCalls } = fakeContext(
          [json(503, {}), json(200, { ...created, dryRun: true, id: null })],
          { apiKey: "customer-key-1" },
        );
        const result = new Messages(context).segments.send({
          ...presale,
          dryRun: true,
        });

        await vi.runAllTimersAsync();

        await expect(result).resolves.toMatchObject({ dryRun: true, id: null });
        expect(apiCalls()).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("sends the idempotency key and replays a 503 with it", async () => {
      vi.useFakeTimers();
      try {
        const { context, apiCalls } = fakeContext(
          [json(503, {}), json(200, created)],
          { apiKey: "customer-key-1" },
        );
        const result = new Messages(context).segments.send(presale, {
          idempotencyKey: "presale-2026-11-20",
        });

        await vi.runAllTimersAsync();

        await expect(result).resolves.toEqual(created);
        const calls = apiCalls();
        expect(calls).toHaveLength(2);
        for (const call of calls) {
          expect(headersOf(call).get("idempotency-key")).toBe(
            "presale-2026-11-20",
          );
          expect(bodyOf(call)).toEqual(presale);
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
