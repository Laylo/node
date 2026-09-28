import { describe, expectTypeOf, test } from "vitest";

import type { CountFansInput, SubscribeFanInput } from "../resources/fans.js";
import type {
  Contact,
  Conversion,
  ConversionAction,
  ConversionCount,
  ConversionCountBucket,
  ConversionCountsReport,
  ConversionSubject,
  CustomerAccount,
  Drop,
  ListConversionCountsParams,
  ListConversionsParams,
  SegmentCountResponse,
  SegmentFilters,
  SegmentLocation,
  SubscribeFanRequest,
  SubscribeFanResponse,
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

  test("CustomerAccount carries nullable profile fields and epoch millis", () => {
    expectTypeOf<CustomerAccount["id"]>().toEqualTypeOf<string>();
    expectTypeOf<CustomerAccount["displayName"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<CustomerAccount["username"]>().toEqualTypeOf<string | null>();
    expectTypeOf<CustomerAccount["createdAt"]>().toEqualTypeOf<number | null>();
  });

  test("conversion count records nest report > count > bucket", () => {
    expectTypeOf<ConversionCountsReport["startDate"]>().toEqualTypeOf<string>();
    expectTypeOf<ConversionCountsReport["counts"]>().toEqualTypeOf<
      ConversionCount[]
    >();
    expectTypeOf<ConversionCount["action"]>().toEqualTypeOf<ConversionAction>();
    expectTypeOf<ConversionCount["total"]>().toEqualTypeOf<number>();
    expectTypeOf<ConversionCount["series"]>().toEqualTypeOf<
      ConversionCountBucket[]
    >();
    expectTypeOf<ConversionCountBucket>().toEqualTypeOf<{
      count: number;
      time: string;
    }>();
  });

  test("SegmentLocation is a country, a state, or a city", () => {
    expectTypeOf<{ country: string }>().toMatchTypeOf<SegmentLocation>();
    expectTypeOf<{
      country: string;
      state: string;
    }>().toMatchTypeOf<SegmentLocation>();
    expectTypeOf<{
      country: string;
      state: string;
      city: string;
      radius: number;
    }>().toMatchTypeOf<SegmentLocation>();
    expectTypeOf<{ city: string }>().not.toMatchTypeOf<SegmentLocation>();
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
    expectTypeOf<
      Record<never, never>
    >().toMatchTypeOf<ListConversionCountsParams>();
    expectTypeOf<ListConversionCountsParams["action"]>().toEqualTypeOf<
      ConversionAction[] | undefined
    >();
  });

  test("segment filters require signUpType and nothing else", () => {
    expectTypeOf<{ signUpType: "sms" }>().toMatchTypeOf<SegmentFilters>();
    expectTypeOf<Record<never, never>>().not.toMatchTypeOf<SegmentFilters>();
    expectTypeOf<SegmentFilters["signUpType"]>().toEqualTypeOf<
      "sms" | "email"
    >();
    expectTypeOf<{
      signUpType: "email";
      signedUpAfter: Date;
    }>().toMatchTypeOf<CountFansInput>();
    expectTypeOf<{
      signUpType: "email";
      signedUpAfter: Date;
    }>().not.toMatchTypeOf<SegmentFilters>();
  });

  test("SubscribeFanRequest requires exactly one channel with its consent", () => {
    expectTypeOf<{
      email: string;
      emailMarketingConsent: true;
      consentGrantedAt: string;
    }>().toMatchTypeOf<SubscribeFanRequest>();
    expectTypeOf<{
      phone: string;
      smsMarketingConsent: true;
      consentGrantedAt: string;
      dropId: string;
    }>().toMatchTypeOf<SubscribeFanRequest>();
    expectTypeOf<{
      email: string;
      emailMarketingConsent: false;
      consentGrantedAt: string;
    }>().not.toMatchTypeOf<SubscribeFanRequest>();
    expectTypeOf<{
      email: string;
      phone: string;
      emailMarketingConsent: true;
      smsMarketingConsent: true;
      consentGrantedAt: string;
    }>().not.toMatchTypeOf<SubscribeFanRequest>();
    expectTypeOf<{
      email: string;
      consentGrantedAt: string;
    }>().not.toMatchTypeOf<SubscribeFanRequest>();
  });

  test("SubscribeFanInput keeps the channel union while accepting a Date", () => {
    expectTypeOf<{
      email: string;
      emailMarketingConsent: true;
      consentGrantedAt: Date;
    }>().toMatchTypeOf<SubscribeFanInput>();
    expectTypeOf<{
      phone: string;
      smsMarketingConsent: true;
      consentGrantedAt: Date;
    }>().toMatchTypeOf<SubscribeFanInput>();
    expectTypeOf<{
      phone: string;
      consentGrantedAt: Date;
    }>().not.toMatchTypeOf<SubscribeFanInput>();
    expectTypeOf<{
      email: string;
      phone: string;
      emailMarketingConsent: true;
      smsMarketingConsent: true;
      consentGrantedAt: Date;
    }>().not.toMatchTypeOf<SubscribeFanInput>();
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

  test("segment count and subscribe responses", () => {
    expectTypeOf<SegmentCountResponse>().toEqualTypeOf<{
      numberOfFans: number;
    }>();
    expectTypeOf<SubscribeFanResponse["fan"]["id"]>().toEqualTypeOf<string>();
    expectTypeOf<SubscribeFanResponse["subscribed"]>().toEqualTypeOf<boolean>();
    expectTypeOf<SubscribeFanResponse["rsvp"]>().toEqualTypeOf<
      { dropId: string; status: "confirmed" } | undefined
    >();
  });
});
