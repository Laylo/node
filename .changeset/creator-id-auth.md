---
"@laylo.com/node": minor
---

Name a customer by `creatorId` instead of an API key. Enterprise integrations can act on any account under their own Laylo account by passing its user id to the constructor (or `LAYLO_CREATOR_ID`), to `forCustomer({ creatorId })`, or in a call's `RequestOptions`. The SDK sends it as `X-Creator-Id`, and `keys.verify()` resolves with `apiKeyStatus: "not_provided"` for such a customer.
