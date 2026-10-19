# @laylo.com/node

## 0.11.0

### Minor Changes

- d9b0fc9: `fans.isSubscribed` and `fans.isUnsubscribed` can check up to 500 contacts in one request. Pass `{ email: [...] }` or `{ phone: [...] }` and the call resolves to a `boolean[]` with one answer per contact, in request order; a single contact still resolves to a `boolean`, and a value typed as either form resolves to `boolean | boolean[]`. Read-only arrays and `as const` tuples are accepted. An empty array or more than 500 contacts throws `LayloConfigurationError` before anything is sent, and an invalid entry fails the whole call with `BadRequestError` naming its index. The new `ContactBatch` type describes the array form, and the new `SubscriptionBatchCheckResponse` and `UnsubscriptionBatchCheckResponse` types describe the batch responses. `SubscriptionCheckResponse` and `UnsubscriptionCheckResponse` are unchanged.

  Type-level change for anyone using the raw query types: `ListConversionsParams['action']` narrows from `string[]` to the documented conversion actions, and `ListConversionCountsParams['action']` no longer includes `RSVP`. Code that builds these types with `RSVP` or an arbitrary string will stop compiling. `conversions.list` and `conversions.counts.list` are not affected: their inputs still accept `RSVP`, and so does the API.

## 0.10.0

### Minor Changes

- ea321a7: `fans.subscribe(fan)` no longer needs consent fields. Pass an `email`, a `phone`, or both, and optionally a `dropId`; the fan's sign-up time is the time of the call. `consentGrantedAt`, `emailMarketingConsent`, and `smsMarketingConsent` are still accepted so existing code compiles, but they're deprecated and the SDK no longer sends them, since the API stopped reading them. A consent flag next to its contact is typed as `true` only, and passing `false` there throws a `LayloConfigurationError` rather than subscribing a fan who declined. The response now types `rejected`, which lists a contact that couldn't be subscribed when the other one in the same call was, and `emailFanId` and `phoneFanId` are present only for a contact that subscribed.

## 0.9.0

### Minor Changes

- b158591: `conversions.events.track(event)` follows the API's current request shape. `metadata` now types the fields Laylo recognizes, including `city`, `state`, and `country`: send `city` and `country` together and Laylo attaches that location to the fan if they don't already have one. `user` accepts extra fields, which are stored but not echoed back, and needs an `email` or `phone`. When an event has no `source`, the API fills it from the `X-Laylo-Source` header and then from the API key's label.

  **Breaking:** `user.fingerprintId`, `user.isAnonymous`, and `createNeoRecord` are gone from the request types, and `action` no longer includes `"RSVP"`. The API ignores the first two, rejects `createNeoRecord` with a 400, and rejects `user.phoneNumber` too, so identify the fan with `email` or `phone` and drop the rest. To RSVP a fan to a drop, use `fans.subscribe` with a `dropId`. `TrackedConversion` no longer has `createNeoRecord`, `user.fingerprintId`, or `user.isAnonymous`.

## 0.8.0

### Minor Changes

- 055502f: New `laylo.billing.creditUsage` resource for the public API's credit usage endpoints. `get(params?)` returns the message credits a customer used over a window of UTC days, per channel, with a series bucketed by day, week, or month. `getForProducts({ productIds, ...params })` returns the same report summed across specific drops and segment messages. `startDate` and `endDate` are UTC days as `YYYY-MM-DD` strings. New types: `CreditUsageReport`, `CreditUsageByProductReport`, `CreditUsage`, `CreditUsageBucket`, `ChannelCreditUsage`, `CreditChannel`, `CreditRates`, `CreditUsageInterval`, `GetCreditUsageParams`, `GetProductCreditUsageParams`, and `GetProductCreditUsageInput`.

### Patch Changes

- 4eb705c: Docs: an API-key-only client is limited to 20 requests a minute per account by default, and Laylo can raise the limit on a specific key, which then gets its own budget.

## 0.7.0

### Minor Changes

- b47bc0c: `messages.segments.send(input)` and `messages.segments.schedule(input)` can now email a segment as well as text one. Pass `segment.signUpType: "email"` with `email: { subject, ctaUrl?, ctaText? }`; Laylo lays the email out from `message`, turns its links into buttons, and adds `ctaUrl` with `ctaText` as the main button. An email segment without `email`, or `email` on an SMS segment, throws `LayloConfigurationError` before any request. New type: `SegmentMessageEmail`.

## 0.6.0

### Minor Changes

- 4d06b16: Add `messages.segments.send(input)` and `messages.segments.schedule(input)`, which text every SMS fan in a segment, either within the next few minutes or at a local date and time in a given time zone. The segment takes the same filters as `fans.segments.count`, with `signUpType: "sms"`, and its sign-up bounds accept a `Date` as well as an ISO 8601 string. Both resolve to `{ id, note, sendAt, dryRun, estimate }`, where `estimate` gives the expected recipients, credits, and cost in US dollars. Pass `dryRun: true` to get the estimate without sending anything; `id` is then null. They're writes, so a server error isn't retried unless the call passes an `idempotencyKey` in its options. The key is sent as the `Idempotency-Key` header and makes a repeat within 24 hours return the first response instead of sending again, so the SDK then retries server errors, dropped connections, and a `409` from an earlier attempt that hasn't finished. A segment with both `signedUpAfter` and `signedUpBefore`, or a malformed key, throws `LayloConfigurationError` before any request. New types: `SendSegmentMessageInput`, `ScheduleSegmentMessageInput`, `MessageSegmentInput`, `SegmentMessageOptions`, `SendSegmentMessageRequest`, `ScheduleSegmentMessageRequest`, `MessageSegment`, `SegmentMessageTimezone`, `SegmentMessage`, and `SegmentMessageEstimate`.

## 0.5.0

### Minor Changes

- cea3bf0: A Laylo account calling its own data can now authenticate with just its API key. `new Laylo({ apiKey })`, or `new Laylo()` with only `LAYLO_API_KEY` set, sends the key as `X-Api-Key` with no access token, so integrator credentials aren't needed. The client works this way whenever none of `userId`, `accessKey`, and `secretKey` is set; setting some but not all of them still throws. Naming any of the three in code, even as `""`, now turns their environment variables off for all three, matching how `apiKey` and `creatorId` already work, so a stray `LAYLO_USER_ID` can be ignored with `userId: ""`. This changes one existing setup: passing some integrator credentials in code and leaving the rest to their environment variables, such as `{ userId }` with `LAYLO_ACCESS_KEY` and `LAYLO_SECRET_KEY` set, now throws. Pass all three in code, or none. Passing them as `undefined` (for example straight from `process.env`) with none set in the environment either throws instead of quietly falling back to the API key. These clients are limited to 20 requests a minute per account and can only act on the key's own account: a `creatorId` (in the constructor, `LAYLO_CREATOR_ID`, `forCustomer`, or a call's options) throws `LayloConfigurationError`, and `customers.list()` and `auth.createToken()` reject with `LayloConfigurationError` without sending a request. Constructing a client with no credentials at all now throws an error that describes both ways to authenticate. On such a client, `toJSON()` reports `userId`, `accessKey`, and `secretKey` as `undefined`, so their types now include `undefined`.

  A key used on its own is also bound by its permissions in Laylo: writes (`fans.subscribe`, `conversions.events.track`, `messages.sms.send`) need the key's "write" permission and every other call except `keys.verify()` needs "read". A key without the permission a call needs gets a `PermissionError`; a key with no permissions stored can only read, and one whose permissions are an empty list can only verify itself. Keys can't be granted "write" yet, so for now key-only clients are read-only.

  `toJSON()` (and so `util.inspect`) now includes a `mode` of `"integrator"` or `"apiKey"`, so a deploy check can assert which way the client authenticates.

- 47af2b7: `fans.subscribe` now accepts an `email` and a `phone` together, each with its consent flag set to `true`. Both channels are subscribed and the two records are linked as the same person. It previously threw a `LayloConfigurationError` for a fan with both; a fan with neither still throws, and so now does a blank (empty or whitespace-only) `email` or `phone`, which used to reach the API and fail there. `SubscribeFanInput` and `SubscribeFanRequest` gain the both-channels variant.

  **Breaking:** the response no longer has `fan`. It carries `emailFanId` and `phoneFanId` instead, each present only when that contact was given. Replace `fan.id` with `emailFanId` for an email subscribe or `phoneFanId` for a phone subscribe; a call with both returns both ids, one for each record.

## 0.4.0

### Minor Changes

- c70e2f6: Add `messages.sms.send(sms)`, which texts a message from the customer's Laylo number to one E.164 phone number or up to 200 at once. Only numbers that currently subscribe to the customer are texted. It resolves to `{ queued, skipped }`, where `skipped` reports each recipient that wasn't texted by its index in `to`, with a reason of `"not_subscribed"`, `"duplicate"`, or `"queue_failed"`. As a write, it is not retried on a server error. New types: `SendSmsRequest`, `SendSmsResponse`, and `SkippedRecipient`.

## 0.3.0

### Minor Changes

- b8b17a5: Wrap the four public endpoints the SDK was missing. `customers.list()` returns the accounts under your integration's own Laylo account, whose ids are what `forCustomer({ creatorId })` accepts. `conversions.counts.list(params?)` reports conversion event counts per action over a window, with a daily series for each. `fans.segments.count(filters)` resolves to the number of fans matching a segment. `fans.subscribe(fan)` subscribes a fan with an explicit marketing-consent record and can RSVP them to a drop in the same call; as a write it is not retried on a server error. Date-valued inputs (`consentGrantedAt`, `startDate`, `endDate`, `signedUpAfter`, `signedUpBefore`) accept a `Date` as well as an ISO 8601 string. New types: `CustomerAccount`, `ConversionCountsReport`, `ConversionCount`, `ConversionCountBucket`, `ListConversionCountsParams`, `ListConversionCountsInput`, `SegmentFilters`, `SegmentLocation`, `SegmentCountResponse`, `CountFansInput`, `SubscribeFanRequest`, `SubscribeFanInput`, and `SubscribeFanResponse`.
- b8b17a5: Integrator credentials are now passed as three options instead of a joined client id. `new Laylo({ userId, accessKey, secretKey })` replaces `clientId` and `clientSecret`, and the environment fallbacks are `LAYLO_USER_ID`, `LAYLO_ACCESS_KEY`, and `LAYLO_SECRET_KEY` in place of `LAYLO_CLIENT_ID` and `LAYLO_CLIENT_SECRET`. The SDK joins the user id and access key into the `client_id` the token endpoint expects, so you no longer build `<userId>.<accessKey>` yourself.

### Patch Changes

- b8b17a5: `LayloAPIError.requestId` is now set on errors from the production API, which sends the request id in the `apigw-requestid` header.

## 0.2.0

### Minor Changes

- 13f70bd: Name a customer by `creatorId` instead of an API key. Enterprise integrations can act on any account under their own Laylo account by passing its user id to the constructor (or `LAYLO_CREATOR_ID`), to `forCustomer({ creatorId })`, or in a call's `RequestOptions`. The SDK sends it as `X-Creator-Id`, and `keys.verify()` resolves with `apiKeyStatus: "not_provided"` for such a customer.
- 4a39744: Trim the SDK to the endpoints the public API has launched. `conversions.definitions.create`, `conversions.definitions.retrieve`, `conversions.events.list`, `fans.segments.count`, and `messages.scheduled.list` are removed, along with the `Page` pagination helpers and the types that only those methods used. The remaining methods are `keys.verify`, `drops.list`, `conversions.list`, `conversions.events.track`, `fans.isSubscribed`, `fans.isUnsubscribed`, and `auth.createToken`.

## 0.1.0

### Minor Changes

- d5567ba: First release of the SDK: a client with keys, drops, conversions, fans, and messages resources, cursor-based pagination, typed errors, automatic retries, and dual ESM/CJS builds.
