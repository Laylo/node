import { describe, expectTypeOf, test } from "vitest";

import type {
  Contact,
  Conversion,
  ConversionAction,
  ConversionSubject,
  Drop,
  ListConversionsParams,
  SubscriptionCheckResponse,
  TokenResponse,
  TrackConversionRequest,
  TrackConversionResponse,
  TrackedConversion,
  UnsubscriptionCheckResponse,
  VerifyKeyResponse,
} from "../types.js";

describe("record aliases", () => {
  test("Drop timestamps are Unix epoch milliseconds", () => {
    expectTypeOf<Drop["createdAt"]>().toEqualTypeOf<number>();
    expectTypeOf<Drop["endDate"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Drop["id"]>().toEqualTypeOf<string>();
  });

  test("ConversionAction is a string literal union, not an enum", () => {
    expectTypeOf<"PURCHASE">().toMatchTypeOf<ConversionAction>();
    expectTypeOf<"TICKET_PURCHASE">().toMatchTypeOf<ConversionAction>();
    expectTypeOf<ConversionAction>().toMatchTypeOf<string>();
    expectTypeOf<"NOT_AN_ACTION">().not.toMatchTypeOf<ConversionAction>();
  });

  test("Contact requires exactly one of email or phone", () => {
    expectTypeOf<{ email: string }>().toMatchTypeOf<Contact>();
    expectTypeOf<{ phone: string }>().toMatchTypeOf<Contact>();
    expectTypeOf<{
      email: string;
      phone: string;
    }>().not.toMatchTypeOf<Contact>();
    expectTypeOf<Record<never, never>>().not.toMatchTypeOf<Contact>();
  });

  test("record aliases resolve to object shapes", () => {
    expectTypeOf<Conversion>().toMatchTypeOf<object>();
    expectTypeOf<ConversionSubject>().toMatchTypeOf<object>();
    expectTypeOf<TrackedConversion>().toMatchTypeOf<object>();
  });
});

describe("request aliases", () => {
  test("TrackConversionRequest takes a ConversionAction", () => {
    expectTypeOf<TrackConversionRequest["action"]>().toMatchTypeOf<string>();
    expectTypeOf<
      TrackConversionRequest["action"]
    >().toEqualTypeOf<ConversionAction>();
  });

  test("list params are all optional", () => {
    expectTypeOf<ListConversionsParams>().toMatchTypeOf<object>();
    expectTypeOf<Record<never, never>>().toMatchTypeOf<ListConversionsParams>();
  });
});

describe("response aliases", () => {
  test("token and key verification responses", () => {
    expectTypeOf<TokenResponse["access_token"]>().toEqualTypeOf<string>();
    expectTypeOf<TokenResponse["expires_in"]>().toEqualTypeOf<number>();
    expectTypeOf<VerifyKeyResponse["apiKeyStatus"]>().toEqualTypeOf<
      "valid" | "not_provided"
    >();
  });

  test("conversion tracking response", () => {
    expectTypeOf<TrackConversionResponse["status"]>().toEqualTypeOf<
      "success" | "failure"
    >();
    expectTypeOf<
      TrackConversionResponse["tracked"]
    >().toEqualTypeOf<TrackedConversion>();
  });

  test("subscription check responses", () => {
    expectTypeOf<SubscriptionCheckResponse>().toEqualTypeOf<{
      isSubscribed: boolean;
    }>();
    expectTypeOf<UnsubscriptionCheckResponse>().toEqualTypeOf<{
      isUnsubscribed: boolean;
    }>();
  });
});
