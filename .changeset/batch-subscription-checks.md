---
"@laylo.com/node": minor
---

`fans.isSubscribed` and `fans.isUnsubscribed` can check up to 500 contacts in one request. Pass `{ email: [...] }` or `{ phone: [...] }` and the call resolves to a `boolean[]` with one answer per contact, in request order; a single contact still resolves to a `boolean`. An empty array or more than 500 contacts throws `LayloConfigurationError` before anything is sent, and an invalid entry fails the whole call with `BadRequestError` naming its index. The new `ContactBatch` type describes the array form, and `SubscriptionCheckResponse` and `UnsubscriptionCheckResponse` now type the answer as `boolean | boolean[]`.

The regenerated types also list the documented actions on the raw `ListConversionsParams` and `ListConversionCountsParams` query types, leaving out `RSVP`. `conversions.list` and `conversions.counts.list` still accept `RSVP`.
