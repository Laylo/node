import { describe, expect, expectTypeOf, it } from "vitest";

import { LayloConfigurationError, NotFoundError } from "../../core/errors.js";
import type {
  ChannelCreditUsage,
  CreditUsageByProductReport,
  CreditUsageReport,
} from "../../types.js";
import { Billing } from "../billing.js";
import { fakeContext, headersOf, json } from "./harness.js";

const channel = (count: number, credits: number): ChannelCreditUsage => ({
  count,
  credits,
  costUsd: credits / 200,
});

const usage = {
  channels: {
    domesticSms: channel(100, 500),
    emails: channel(120, 240),
    instagram: channel(0, 0),
    internationalSms: channel(1, 12),
    mms: channel(0, 0),
  },
  count: 221,
  credits: 752,
  costUsd: 3.76,
};

const report: CreditUsageReport = {
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  interval: "month",
  rates: {
    creditsPerDollar: 200,
    domesticSms: 5,
    emails: 2,
    instagram: 3,
    internationalSms: 12,
    mms: 12,
  },
  series: [{ start: "2026-09-01", ...usage }],
  total: usage,
};

describe("Billing", () => {
  describe("creditUsage.get", () => {
    it("issues GET /v1/billing/credit-usage with no query when called bare", async () => {
      const { context, apiCalls } = fakeContext([json(200, report)], {
        apiKey: "customer-key-1",
      });

      const credits = await new Billing(context).creditUsage.get();

      expect(credits).toEqual(report);
      expectTypeOf(credits).toEqualTypeOf<CreditUsageReport>();
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/billing/credit-usage",
      );
      expect(call?.init.method).toBe("GET");
      expect(call && headersOf(call).get("x-api-key")).toBe("customer-key-1");
    });

    it("sends string days and the interval as query keys", async () => {
      const { context, apiCalls } = fakeContext([json(200, report)], {
        apiKey: "customer-key-1",
      });

      await new Billing(context).creditUsage.get({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        interval: "week",
      });

      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/billing/credit-usage?startDate=2026-09-01&endDate=2026-09-30&interval=week",
      );
    });
  });

  describe("creditUsage.getForProducts", () => {
    const productReport: CreditUsageByProductReport = {
      ...report,
      productIds: ["drop_123", "message_456"],
    };

    it("repeats productId once per distinct product alongside the window", async () => {
      const { context, apiCalls } = fakeContext([json(200, productReport)], {
        apiKey: "customer-key-1",
      });

      const credits = await new Billing(context).creditUsage.getForProducts({
        productIds: ["drop_123", "message_456", "drop_123"],
        startDate: "2026-09-01",
        interval: "month",
      });

      expect(credits).toEqual(productReport);
      expectTypeOf(credits).toEqualTypeOf<CreditUsageByProductReport>();
      const [call] = apiCalls();
      expect(call?.url).toBe(
        "https://api.example.test/api/v1/billing/credit-usage/products?productId=drop_123&productId=message_456&startDate=2026-09-01&interval=month",
      );
      expect(call?.init.method).toBe("GET");
    });

    it("rejects missing or empty productIds before any request", async () => {
      const { context, apiCalls } = fakeContext([], {
        apiKey: "customer-key-1",
      });

      const billing = new Billing(context);

      const failures: unknown[] = await Promise.all([
        billing.creditUsage
          .getForProducts({ productIds: [] })
          .catch((error: unknown) => error),
        billing.creditUsage
          .getForProducts(undefined as never)
          .catch((error: unknown) => error),
      ]);

      for (const failure of failures) {
        expect(failure).toBeInstanceOf(LayloConfigurationError);
      }
      expect(apiCalls()).toHaveLength(0);
    });

    it("surfaces a product the customer doesn't own as NotFoundError", async () => {
      const { context } = fakeContext(
        [
          json(404, {
            error: {
              code: "NOT_FOUND",
              message: "Product not found: drop_999",
            },
          }),
        ],
        { apiKey: "customer-key-1" },
      );

      const failure: unknown = await new Billing(context).creditUsage
        .getForProducts({ productIds: ["drop_999"] })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(NotFoundError);
    });
  });
});
