---
"@laylo.com/node": minor
---

Trim the SDK to the endpoints the public API has launched. `conversions.definitions.create`, `conversions.definitions.retrieve`, `conversions.events.list`, `fans.segments.count`, and `messages.scheduled.list` are removed, along with the `Page` pagination helpers and the types that only those methods used. The remaining methods are `keys.verify`, `drops.list`, `conversions.list`, `conversions.events.track`, `fans.isSubscribed`, `fans.isUnsubscribed`, and `auth.createToken`.
