---
"@laylo.com/node": minor
---

Add `messages.sms.send(sms)`, which texts a message from the customer's Laylo number to one E.164 phone number or up to 200 at once. Only numbers that currently subscribe to the customer are texted. It resolves to `{ queued, skipped }`, where `skipped` reports each recipient that wasn't texted by its index in `to`, with a reason of `"not_subscribed"`, `"duplicate"`, or `"queue_failed"`. As a write, it is not retried on a server error. New types: `SendSmsRequest`, `SendSmsResponse`, and `SkippedRecipient`.
