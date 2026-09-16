import { describe, expectTypeOf, test } from "vitest";

import type {
  Contact,
  Conversion,
  ConversionAction,
  ConversionEvent,
  ConversionFan,
  ConversionSubject,
  CreateConversionDefinitionRequest,
  CreateConversionDefinitionResponse,
  CursorPageInfo,
  Drop,
  Fan,
  FanConversion,
  ListConversionEventsParams,
  ListConversionsParams,
  Location,
  RetrieveConversionDefinitionParams,
  SegmentConfiguration,
  SegmentCountResponse,
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

  test("CursorPageInfo carries the pagination flags", () => {
    expectTypeOf<CursorPageInfo["has_more"]>().toEqualTypeOf<boolean>();
    expectTypeOf<CursorPageInfo["next_cursor"]>().toMatchTypeOf<
      string | null
    >();
  });

  test("record aliases resolve to object shapes", () => {
    expectTypeOf<Conversion>().toMatchTypeOf<object>();
    expectTypeOf<ConversionEvent>().toMatchTypeOf<object>();
    expectTypeOf<ConversionFan>().toMatchTypeOf<object>();
    expectTypeOf<ConversionSubject>().toMatchTypeOf<object>();
    expectTypeOf<Fan>().toMatchTypeOf<object>();
    expectTypeOf<FanConversion>().toMatchTypeOf<object>();
    expectTypeOf<Location>().toMatchTypeOf<object>();
    expectTypeOf<SegmentConfiguration>().toMatchTypeOf<object>();
    expectTypeOf<TrackedConversion>().toMatchTypeOf<object>();
  });
});

describe("request aliases", () => {
  test("TrackConversionRequest takes a ConversionAction", () => {
    expectTypeOf<TrackConversionRequest["action"]>().toMatchTypeOf<string>();
    expectTypeOf<CreateConversionDefinitionRequest>().toMatchTypeOf<object>();
  });

  test("list params keep required and optional fields apart", () => {
    expectTypeOf<
      ListConversionEventsParams["action"]
    >().toMatchTypeOf<string>();
    expectTypeOf<ListConversionEventsParams>().toMatchTypeOf<{
      cursor?: string;
    }>();
    expectTypeOf<ListConversionsParams>().toMatchTypeOf<object>();
    expectTypeOf<
      RetrieveConversionDefinitionParams["name"]
    >().toEqualTypeOf<string>();
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

  test("conversion tracking and segment counting responses", () => {
    expectTypeOf<TrackConversionResponse>().toMatchTypeOf<object>();
    expectTypeOf<CreateConversionDefinitionResponse>().toMatchTypeOf<object>();
    expectTypeOf<
      SegmentCountResponse["numberOfFans"]
    >().toEqualTypeOf<number>();
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
