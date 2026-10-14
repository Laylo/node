---
"@laylo.com/node": minor
---

`conversions.events.track(event)` follows the API's current request shape. `metadata` now types the fields Laylo recognizes, including `city`, `state`, and `country`: send `city` and `country` together and Laylo attaches that location to the fan if they don't already have one. `user` accepts extra fields, which are stored but not echoed back, and needs an `email` or `phone`. `user.fingerprintId`, `user.isAnonymous`, and `createNeoRecord` are gone from the types: the API ignores the first two and rejects `createNeoRecord` with a 400, as it does `user.phoneNumber`. `action` no longer includes `"RSVP"`, and `TrackedConversion` no longer has `createNeoRecord`, `user.fingerprintId`, or `user.isAnonymous`. When an event has no `source`, the API now fills it from the `X-Laylo-Source` header and then from the API key's label.
