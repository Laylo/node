---
"@laylo.com/node": minor
---

`fans.isSubscribed` and `fans.isUnsubscribed` can check up to 500 contacts in one request. Pass `{ email: [...] }` or `{ phone: [...] }` and the call resolves to a `boolean[]` with one answer per contact, in request order; a single contact still resolves to a `boolean`, and a value typed as either form resolves to `boolean | boolean[]`. Read-only arrays and `as const` tuples are accepted. An empty array or more than 500 contacts throws `LayloConfigurationError` before anything is sent, and an invalid entry fails the whole call with `BadRequestError` naming its index. The new `ContactBatch` type describes the array form, and the new `SubscriptionBatchCheckResponse` and `UnsubscriptionBatchCheckResponse` types describe the batch responses. `SubscriptionCheckResponse` and `UnsubscriptionCheckResponse` are unchanged.

Type-level change for anyone using the raw query types: `ListConversionsParams['action']` narrows from `string[]` to the documented conversion actions, and `ListConversionCountsParams['action']` no longer includes `RSVP`. Code that builds these types with `RSVP` or an arbitrary string will stop compiling. `conversions.list` and `conversions.counts.list` are not affected: their inputs still accept `RSVP`, and so does the API.
