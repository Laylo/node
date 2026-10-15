---
"@laylo.com/node": minor
---

`fans.subscribe(fan)` no longer needs consent fields. Pass an `email`, a `phone`, or both, and optionally a `dropId`; the fan's sign-up time is the time of the call. `consentGrantedAt`, `emailMarketingConsent`, and `smsMarketingConsent` are still accepted so existing code compiles, but they're deprecated and the SDK no longer sends them, since the API stopped reading them. The response now types `rejected`, which lists a contact that couldn't be subscribed when the other one in the same call was, and `emailFanId` and `phoneFanId` are present only for a contact that subscribed.
