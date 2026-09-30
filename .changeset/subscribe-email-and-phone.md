---
"@laylo.com/node": minor
---

`fans.subscribe` now accepts an `email` and a `phone` together, each with its consent flag set to `true`. Both channels are subscribed and the two records are linked as the same person. It previously threw a `LayloConfigurationError` for a fan with both; a fan with neither still throws, and so now does a blank (empty or whitespace-only) `email` or `phone`, which used to reach the API and fail there. `SubscribeFanInput` and `SubscribeFanRequest` gain the both-channels variant.

**Breaking:** the response no longer has `fan`. It carries `emailFanId` and `phoneFanId` instead, each present only when that contact was given. Replace `fan.id` with `emailFanId` for an email subscribe or `phoneFanId` for a phone subscribe; a call with both returns both ids, one for each record.
