---
"@laylo.com/node": minor
---

Add `messages.segments.send(input)` and `messages.segments.schedule(input)`, which text every SMS fan in a segment, either within the next few minutes or at a local date and time in a given time zone. The segment takes the same filters as `fans.segments.count`, with `signUpType: "sms"`, and its sign-up bounds accept a `Date` as well as an ISO 8601 string. Both resolve to `{ id, note, sendAt }`. They're writes, so a server error isn't retried unless the call passes an `idempotencyKey` in its options, which is sent as the `Idempotency-Key` header and makes a repeat within 24 hours return the first response instead of sending again. New types: `SendSegmentMessageInput`, `ScheduleSegmentMessageInput`, `MessageSegmentInput`, `SegmentMessageOptions`, `SendSegmentMessageRequest`, `ScheduleSegmentMessageRequest`, `MessageSegment`, `SegmentMessageTimezone`, and `SegmentMessage`.
