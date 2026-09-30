---
"@laylo.com/node": minor
---

A Laylo account calling its own data can now authenticate with just its API key. `new Laylo({ apiKey })`, or `new Laylo()` with only `LAYLO_API_KEY` set, sends the key as `X-Api-Key` with no access token, so integrator credentials aren't needed. The client works this way whenever none of `userId`, `accessKey`, and `secretKey` is set; setting some but not all of them still throws. These clients are limited to 20 requests a minute per account and can only act on the key's own account: a `creatorId` (in the constructor, `LAYLO_CREATOR_ID`, `forCustomer`, or a call's options) throws `LayloConfigurationError`, `customers.list()` gets a `PermissionError` from the API, and `auth.createToken()` rejects. Constructing a client with no credentials at all now throws an error that describes both ways to authenticate. On such a client, `toJSON()` reports `userId`, `accessKey`, and `secretKey` as `undefined`, so their types now include `undefined`.

A key used on its own is also bound by its permissions in Laylo: writes (`fans.subscribe`, `conversions.events.track`, `messages.sms.send`) need the key's "write" permission and every other call needs "read". A key without the permission a call needs gets a `PermissionError`; keys with no permissions set can only read.
