---
"@laylo.com/node": patch
---

`LayloAPIError.requestId` is now set on errors from the production API, which sends the request id in the `apigw-requestid` header.
