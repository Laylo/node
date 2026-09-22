---
name: laylo-node
description: Helps build with the Laylo Node.js SDK (@laylo.com/node) — setting up and verifying credentials (integrator user id, access key, and secret key, plus a customer API key or creator id) and answering questions about a Laylo account's drops, fans, subscriptions, audience segments, and conversions. Use when the user mentions Laylo, @laylo.com/node, a Laylo API key, drops, RSVPs, fan subscriptions, or conversion tracking in a JavaScript or TypeScript project.
---

# Laylo Node.js SDK

`@laylo.com/node` is the official Node.js client for the Laylo public API. It
mints and refreshes access tokens, retries transient failures, and throws typed
errors. Requires Node.js 20 or later. Full docs: https://developers.laylo.com

## What it can do

This is the SDK's entire surface. Every method below also takes an optional
trailing `RequestOptions` (`apiKey`, `creatorId`, `signal`, `timeoutMs`,
`retry`). Parameters and response shapes are in
[references/methods.md](references/methods.md).

| Method                             | Answers                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `keys.verify()`                    | Is this customer API key valid?                                |
| `customers.list()`                 | Which accounts sit under my integration's own account?         |
| `drops.list()`                     | What active public drops does the customer have?               |
| `conversions.list(params?)`        | What conversion definitions exist (tickets, merch, RSVPs, …)?  |
| `conversions.counts.list(params?)` | How many conversion events per action over a window, by day?   |
| `conversions.events.track(event)`  | Record a purchase, check-in, click, etc. for a fan (write)     |
| `fans.isSubscribed(contact)`       | Does this email or phone currently subscribe?                  |
| `fans.isUnsubscribed(contact)`     | Did this contact subscribe once and later unsubscribe?         |
| `fans.segments.count(filters)`     | How many fans match a segment (channel, drops, place, date)?   |
| `fans.subscribe(fan)`              | Subscribe a fan with a consent record, optionally RSVP (write) |
| `auth.createToken()`               | A raw bearer token, only for calling the API outside the SDK   |

If one of these methods is `undefined` on the client, the installed SDK
predates it. Upgrade with `npm install @laylo.com/node@latest`. If it is still
missing after that, the release that adds it hasn't been published yet: tell
the user so, rather than calling the API some other way.

If the user asks for something that isn't in this table, say plainly that the
SDK doesn't support it and point them to https://developers.laylo.com. Don't
invent a method, don't guess at API URLs to fill the gap, and don't describe
Laylo dashboard features you can't verify.

### Exact names

Don't guess parameter names. A misspelled field in a plain `.js` or `.mjs`
file is silently ignored, and the call returns an unfiltered answer that looks
right. Check [references/methods.md](references/methods.md) before writing a
call you haven't seen here. The ones that are easiest to get wrong:

- `fans.segments.count` filters: `signUpType` (required, `"sms"` or
  `"email"`), `dropIds`, `excludedDropIds`, `conversionIds`,
  `excludedConversionIds`, `locations`, `excludedLocations`, `signedUpAfter`
  (inclusive), `signedUpBefore` (exclusive). It resolves to a plain `number`.
- `conversions.counts.list` takes `action`, `startDate`, `endDate`, and
  resolves to `{ startDate, endDate, counts: [{ action, total, series }] }`.
- `fans.isSubscribed` and `fans.isUnsubscribed` resolve to a plain `boolean`.
- `fans.subscribe` takes `email` + `emailMarketingConsent: true`, or `phone` +
  `smsMarketingConsent: true`, plus `consentGrantedAt` and an optional
  `dropId`.

## Setting up authentication

Walk the user through these steps in order, confirming each one before moving
to the next.

1. **Install.** `npm install @laylo.com/node` (or pnpm/yarn).
2. **Integrator credentials.** A `userId`, `accessKey`, and `secretKey`
   issued to the integration. They come from the user's Laylo account manager
   and can't be self-served. The `userId` is the Laylo user id of the account
   the credentials were issued under. The secret key is a server-side secret
   and must never ship to a browser or a mobile app.
3. **Name the customer.** Every call acts on one Laylo account, named in one of
   two ways. Use one or the other, never both. Ask the user which situation
   they're in rather than assuming an API key (see
   [Choosing between them](#choosing-between-an-api-key-and-a-creator-id)).
   - **API key.** The account owner generates it at
     https://laylo.com/settings?tab=Integrations and hands it over. The SDK
     sends it as `X-Api-Key`.
   - **Creator id.** Only for enterprise integrations whose customers sit
     under the integration's own Laylo account. Pass the account's Laylo user
     id instead of collecting a key. `customers.list()` returns the valid ids.
     The SDK sends it as `X-Creator-Id`.
4. **Store them in the environment.** The SDK reads `LAYLO_USER_ID`,
   `LAYLO_ACCESS_KEY`, `LAYLO_SECRET_KEY`, and one of `LAYLO_API_KEY` or
   `LAYLO_CREATOR_ID`.
   Having both of the last two set is a construction error. Have the user
   put these in a `.env` file themselves, and make sure `.env` is in
   `.gitignore`.
5. **Verify.** Run the check below. Success prints
   `apiKeyStatus: "valid"`, or `"not_provided"` for a creator-id customer,
   where no key exists to check.

```js
// verify-laylo.mjs — run with: node --env-file=.env verify-laylo.mjs
import Laylo from "@laylo.com/node";

const laylo = new Laylo();
console.log(await laylo.keys.verify());
```

`--env-file` needs Node 20.6+. On older versions, export the variables in the
shell or load them with `dotenv`.

### Choosing between an API key and a creator id

- **Use an API key** when the account isn't under yours, such as an
  independent artist connecting to your product. A key works for any Laylo
  account, and the owner stays in control: they generate it, hand it over,
  and can revoke it at any time. The cost falls on you. You collect a key
  from each customer, store it as a secret, check it with
  `keys.verify({ apiKey })` before saving it, and handle it being revoked
  (`AuthenticationError` with `apiKeyStatus: "invalid"`).
- **Use a creator id** when every account you act on sits under your
  enterprise Laylo account. There are no keys to collect, store, or rotate,
  because access follows the roster. It works at any depth of sub-accounts,
  your own account's id is accepted too, and `customers.list()` finds the
  accounts for you. A creator id identifies an account but isn't a secret.
  The limits: it only works for accounts on your roster (anything else throws
  `PermissionError`), `keys.verify()` has no key to check and returns
  `apiKeyStatus: "not_provided"`, and a roster account that has been deleted
  throws `AuthenticationError`.
- **With a mix of both kinds of account,** name each customer the way that
  fits it: `laylo.forCustomer(apiKey)` or `laylo.forCustomer({ creatorId })`.
  Leave both out of the constructor and the environment in that case, so no
  call falls back to the wrong customer.

### When verification fails

| Error                                                | Meaning and fix                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `LayloConfigurationError`                            | A credential is missing or malformed. The message names it. Check the env var names, and that `userId` holds only the user id. |
| `AuthenticationError` with `apiKeyStatus: "invalid"` | The customer API key is wrong or was revoked. Generate a new key in Laylo settings.                                            |
| `AuthenticationError` otherwise                      | The access key or secret key was rejected, or a creator id no longer resolves to an account.                                   |
| `PermissionError`                                    | The account has no paid Laylo plan, or the creator id isn't under the integration's account.                                   |
| `RateLimitError`                                     | Too many requests. Wait `error.retryAfter` seconds.                                                                            |
| `LayloConnectionError` / `LayloTimeoutError`         | Network trouble. The request never got a usable response.                                                                      |

Every API error carries `status`, `code`, and `message`. When contacting
Laylo support, include the request id:
`error.requestId ?? error.headers?.get("apigw-requestid")`. Older SDK releases
leave `requestId` unset, which is what the header fallback covers.

## Answering questions about an account

For a question like "how many RSVPs did we get last month?", pick the method
from the table, write a short script, and run it if you can execute code. If
you can't, give the user the script and the command to run it.

```js
// laylo-query.mjs — run with: node --env-file=.env laylo-query.mjs
import Laylo from "@laylo.com/node";

const laylo = new Laylo();

const report = await laylo.conversions.counts.list({
  action: "RSVP",
  startDate: "2026-08-01T00:00:00-07:00",
  endDate: "2026-08-31T23:59:59-07:00",
});
console.log(report.counts);
```

Common mappings:

- "Which drops are live?" → `drops.list()`
- "How many SMS subscribers in California signed up this year?" →
  `fans.segments.count({ signUpType: "sms", locations: [{ country: "US", state: "CA" }], signedUpAfter: "2026-01-01T00:00:00Z" })`
- "Is fan@example.com still subscribed?" → `fans.isSubscribed({ email })`
- "Ticket sales this week?" → `conversions.counts.list({ action: "TICKET_PURCHASE", startDate })`
- "Which artists can I act as?" → `customers.list()`, then
  `laylo.forCustomer({ creatorId: id })` for each

Several customers in one process: build one client with only the integrator
credentials, then call `laylo.forCustomer(apiKey)` or
`laylo.forCustomer({ creatorId })` for each account. The views share one
access token, so creating them is cheap.

## Rules to follow

- **Keep secrets out of the chat.** Ask the user to put credentials in `.env`
  instead of pasting them. If they paste one anyway, write it to `.env` for
  them rather than asking them to redo it, and mention that a secret shared in
  a chat is worth rotating if the conversation is stored or shared. Never echo
  a secret or API key back, and never hard-code one in a source file. Logging
  the client itself is safe: its `toJSON` masks the key and redacts the
  secret.
- **Confirm writes first.** `fans.subscribe` and `conversions.events.track`
  change real fan data. Show the user exactly what will be sent and get a yes
  before running either against a live account. Reads can run freely.
- **Consent must be real.** Only call `fans.subscribe` for someone who actually
  consented to marketing on that channel, with `consentGrantedAt` set to when
  they did. Subscribing a fan also clears an earlier unsubscribe, so never use
  it to re-add someone who opted out unless they opted in again.
- **Use one customer per call.** Never pass both `apiKey` and `creatorId`.

## Gotchas

- Phone numbers must be E.164, like `+12025550100`.
- Contact checks take exactly one of `{ email }` or `{ phone }`.
- Dates you send accept a `Date` or an ISO 8601 string with an explicit offset
  (`Z` or `-07:00`). Dates in drop and customer responses (`createdAt`,
  `endDate`) are Unix epoch **milliseconds**.
- In `fans.segments.count`, an empty array switches that filter off. It does
  not mean "match nothing." Leave the key out rather than passing `[]`.
- `conversions.counts.list` defaults to the last 28 days. Its daily buckets
  start at midnight Pacific, so for a calendar day or month, bound the window
  in Pacific time (`-07:00` in summer, `-08:00` in winter). A window written
  in UTC picks up an extra bucket for the day before. Counts are events, not
  distinct fans.
- `conversions.events.track` can resolve with `status: "failure"` without
  throwing, so check `status`. Reusing `metadata.uniqueId` merges repeats,
  which makes retries safe.
- Writes (`fans.subscribe`, `conversions.events.track`) aren't retried on a
  5xx, since the server may already have applied them. Reads, and 429s
  everywhere, are retried up to twice.
- `customers.list()` is scoped to the integration, but a customer must still
  be named on the call.
