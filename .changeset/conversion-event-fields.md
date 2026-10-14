---
"@laylo.com/node": minor
---

`conversions.events.track(event)` follows the API's current request shape. `metadata` now types the fields Laylo recognizes, including `city`, `state`, and `country`: send `city` and `country` together and Laylo attaches that location to the fan if they don't already have one. `user` accepts extra fields, which are stored but not echoed back, and needs an `email` or `phone`. When an event has no `source`, the API fills it from the `X-Laylo-Source` header and then from the API key's label.

**Breaking:** `user.fingerprintId`, `user.isAnonymous`, and `createNeoRecord` are gone from the request types, and `action` no longer includes `"RSVP"`. The API ignores the first two, rejects `createNeoRecord` with a 400, and rejects `user.phoneNumber` too, so identify the fan with `email` or `phone` and drop the rest. To RSVP a fan to a drop, use `fans.subscribe` with a `dropId`. `TrackedConversion` no longer has `createNeoRecord`, `user.fingerprintId`, or `user.isAnonymous`.
