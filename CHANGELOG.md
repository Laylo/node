# @laylo.com/node

## 0.3.0

### Minor Changes

- 6c87dcb: Wrap the four public endpoints the SDK was missing. `customers.list()` returns the accounts under your integration's own Laylo account, whose ids are what `forCustomer({ creatorId })` accepts. `conversions.counts.list(params?)` reports conversion event counts per action over a window, with a daily series for each. `fans.segments.count(filters)` resolves to the number of fans matching a segment. `fans.subscribe(fan)` subscribes a fan with an explicit marketing-consent record and can RSVP them to a drop in the same call; as a write it is not retried on a server error. Date-valued inputs (`consentGrantedAt`, `startDate`, `endDate`, `signedUpAfter`, `signedUpBefore`) accept a `Date` as well as an ISO 8601 string. New types: `CustomerAccount`, `ConversionCountsReport`, `ConversionCount`, `ConversionCountBucket`, `ListConversionCountsParams`, `ListConversionCountsInput`, `SegmentFilters`, `SegmentLocation`, `SegmentCountResponse`, `CountFansInput`, `SubscribeFanRequest`, `SubscribeFanInput`, and `SubscribeFanResponse`.
- 20faa0e: Integrator credentials are now passed as three options instead of a joined client id. `new Laylo({ userId, accessKey, secretKey })` replaces `clientId` and `clientSecret`, and the environment fallbacks are `LAYLO_USER_ID`, `LAYLO_ACCESS_KEY`, and `LAYLO_SECRET_KEY` in place of `LAYLO_CLIENT_ID` and `LAYLO_CLIENT_SECRET`. The SDK joins the user id and access key into the `client_id` the token endpoint expects, so you no longer build `<userId>.<accessKey>` yourself.

### Patch Changes

- 796a4fa: `LayloAPIError.requestId` is now set on errors from the production API, which sends the request id in the `apigw-requestid` header.

## 0.2.0

### Minor Changes

- 13f70bd: Name a customer by `creatorId` instead of an API key. Enterprise integrations can act on any account under their own Laylo account by passing its user id to the constructor (or `LAYLO_CREATOR_ID`), to `forCustomer({ creatorId })`, or in a call's `RequestOptions`. The SDK sends it as `X-Creator-Id`, and `keys.verify()` resolves with `apiKeyStatus: "not_provided"` for such a customer.
- 4a39744: Trim the SDK to the endpoints the public API has launched. `conversions.definitions.create`, `conversions.definitions.retrieve`, `conversions.events.list`, `fans.segments.count`, and `messages.scheduled.list` are removed, along with the `Page` pagination helpers and the types that only those methods used. The remaining methods are `keys.verify`, `drops.list`, `conversions.list`, `conversions.events.track`, `fans.isSubscribed`, `fans.isUnsubscribed`, and `auth.createToken`.

## 0.1.0

### Minor Changes

- d5567ba: First release of the SDK: a client with keys, drops, conversions, fans, and messages resources, cursor-based pagination, typed errors, automatic retries, and dual ESM/CJS builds.
