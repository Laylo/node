import { describe, expect, expectTypeOf, it } from "vitest";

import {
  BadRequestError,
  LayloConfigurationError,
  ServerError,
} from "../../core/errors.js";
import type { SendSmsRequest, SendSmsResponse } from "../../types.js";
import { Messages } from "../messages.js";
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

    it("surfaces an invalid number as a BadRequestError", async () => {
      const { context } = fakeContext(
        [
          json(400, {
            error: {
              code: "BAD_REQUEST",
              message: "Invalid 'to[1]' in payload",
            },
          }),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Messages(context).sms
        .send({ message: "Hi", to: ["+12025550100", "nope"] })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestError);
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
});
