# @laylo.com/node

## 0.2.0

### Minor Changes

- 13f70bd: Name a customer by `creatorId` instead of an API key. Enterprise integrations can act on any account under their own Laylo account by passing its user id to the constructor (or `LAYLO_CREATOR_ID`), to `forCustomer({ creatorId })`, or in a call's `RequestOptions`. The SDK sends it as `X-Creator-Id`, and `keys.verify()` resolves with `apiKeyStatus: "not_provided"` for such a customer.
- 4a39744: Trim the SDK to the endpoints the public API has launched. `conversions.definitions.create`, `conversions.definitions.retrieve`, `conversions.events.list`, `fans.segments.count`, and `messages.scheduled.list` are removed, along with the `Page` pagination helpers and the types that only those methods used. The remaining methods are `keys.verify`, `drops.list`, `conversions.list`, `conversions.events.track`, `fans.isSubscribed`, `fans.isUnsubscribed`, and `auth.createToken`.

## 0.1.0

### Minor Changes

- d5567ba: First release of the SDK: a client with keys, drops, conversions, fans, and messages resources, cursor-based pagination, typed errors, automatic retries, and dual ESM/CJS builds.
