# @laylo.com/node

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
