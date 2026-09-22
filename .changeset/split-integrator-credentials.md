---
"@laylo.com/node": minor
---

Integrator credentials are now passed as three options instead of a joined client id. `new Laylo({ userId, accessKey, secretKey })` replaces `clientId` and `clientSecret`, and the environment fallbacks are `LAYLO_USER_ID`, `LAYLO_ACCESS_KEY`, and `LAYLO_SECRET_KEY` in place of `LAYLO_CLIENT_ID` and `LAYLO_CLIENT_SECRET`. The SDK joins the user id and access key into the `client_id` the token endpoint expects, so you no longer build `<userId>.<accessKey>` yourself.
