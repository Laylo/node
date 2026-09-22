---
name: laylo-api
description: Helps call the Laylo public HTTP API directly, from any language or with curl — setting up and verifying credentials (client id and secret, bearer tokens, a customer API key or creator id) and answering questions about a Laylo account's drops, fans, subscriptions, audience segments, and conversions. Use when the user mentions the Laylo API, events.laylo.com, a Laylo API key or access token, drops, RSVPs, fan subscriptions, or conversion tracking outside a Node.js SDK project.
---

# Laylo public API

A JSON-over-HTTPS API for reading and writing a Laylo account's drops, fans,
and conversions. Full docs: https://developers.laylo.com. Node.js projects can
use the official SDK (`@laylo.com/node`) instead, which handles tokens,
retries, and errors for you. Mention it if the user is on Node.

**Base URL:** `https://events.laylo.com/api`

## What it can do

These are the only endpoints this skill covers. Request and response shapes
are in [references/endpoints.md](references/endpoints.md).

| Endpoint                      | Answers                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `POST /v1/auth/token`         | Mint a bearer token from the integrator credentials            |
| `GET /v1/keys/verify`         | Is this customer API key valid?                                |
| `GET /v1/customers`           | Which accounts sit under my integration's own account?         |
| `GET /v1/drops`               | What active public drops does the customer have?               |
| `GET /v1/conversions`         | What conversion definitions exist (tickets, merch, RSVPs, …)?  |
| `GET /v1/conversions/counts`  | How many conversion events per action over a window, by day?   |
| `POST /v1/conversions/events` | Record a purchase, check-in, click, etc. for a fan (write)     |
| `POST /v1/fans/subscribed`    | Does this email or phone currently subscribe?                  |
| `POST /v1/fans/unsubscribed`  | Did this contact subscribe once and later unsubscribe?         |
| `GET /v1/fans/segments`       | How many fans match a segment (channel, drops, place, date)?   |
| `POST /v1/fans/subscriptions` | Subscribe a fan with a consent record, optionally RSVP (write) |

If the user asks for something not in this table, say plainly that it isn't
available and point them to https://developers.laylo.com. Don't guess at
other paths, don't probe the API for undocumented routes, and don't describe
Laylo dashboard features you can't verify.

### Exact names

Don't guess field names. The API ignores query parameters it doesn't know,
so a misspelled filter returns an unfiltered answer that looks right, and a
misread response key reads as missing. Check
[references/endpoints.md](references/endpoints.md) before writing a call you
haven't seen here. The ones that are easiest to get wrong:

- `GET /v1/fans/segments` query: `signUpType` (required, `sms` or `email`),
  `dropIds`, `excludedDropIds`, `conversionIds`, `excludedConversionIds`,
  `locations`, `excludedLocations`, `signedUpAfter` (inclusive),
  `signedUpBefore` (exclusive). Response: `{ "numberOfFans": 42 }`.
- `GET /v1/conversions/counts` query: `action`, `startDate`, `endDate`.
  Daily buckets start at midnight Pacific, so bound a calendar day or month
  in Pacific time (`-07:00` in summer, `-08:00` in winter). A UTC window picks
  up an extra bucket for the day before.
  Response: `{ startDate, endDate, counts: [{ action, total, series }] }`.
- `POST /v1/fans/subscribed` returns `{ "isSubscribed": true }`, and
  `POST /v1/fans/unsubscribed` returns `{ "isUnsubscribed": false }`.
- `POST /v1/fans/subscriptions` takes `email` + `emailMarketingConsent: true`,
  or `phone` + `smsMarketingConsent: true`, plus `consentGrantedAt` and an
  optional `dropId`.

## How authentication works

Every request except the token mint carries two things:

1. `Authorization: Bearer <access_token>`, which identifies the
   **integration**. Mint the token from the integrator `client_id` and
   `client_secret`, which come from the user's Laylo account manager.
2. **The customer**, meaning the Laylo account the call acts on, in exactly
   one header:
   - `X-Api-Key: <key>`. The account owner generates the key at
     https://laylo.com/settings?tab=Integrations.
   - `X-Creator-Id: <user id>`. Only for enterprise integrations whose
     customers sit under the integration's own Laylo account.
     `GET /v1/customers` lists the valid ids.

Optionally send `X-Laylo-Source: <your integration name>`.

### Choosing between an API key and a creator id

- **Use an API key** when the account isn't under yours, such as an
  independent artist connecting to your product. A key works for any Laylo
  account, and the owner stays in control: they generate it, hand it over,
  and can revoke it at any time. The cost falls on you. You collect a key
  from each customer, store it as a secret, check it with
  `GET /v1/keys/verify` before saving it, and handle it being revoked (a 401
  with `error.apiKeyStatus: "invalid"`).
- **Use a creator id** when every account you act on sits under your
  enterprise Laylo account. There are no keys to collect, store, or rotate,
  because access follows the roster. It works at any depth of sub-accounts,
  your own account's id is accepted too, and `GET /v1/customers` finds the
  accounts for you. A creator id identifies an account but isn't a secret.
  The limits: it only works for accounts on your roster (anything else gets a
  403), `GET /v1/keys/verify` has no key to check and returns
  `"apiKeyStatus":"not_provided"`, and a roster account that has been deleted
  gets a 401.
- **With a mix of both kinds of account,** send whichever header fits each
  customer, per request. Never send both on the same request.

The client id, client secret, and access token are server-side secrets. Never
send them from a browser or a mobile app.

## Setting up authentication

Walk the user through these steps in order, confirming each one before moving
to the next.

1. **Pick how to name the customer.** Ask the user which situation they're
   in rather than assuming an API key (see
   [Choosing between them](#choosing-between-an-api-key-and-a-creator-id)).
2. **Collect credentials into the environment.** Have the user put
   `LAYLO_CLIENT_ID`, `LAYLO_CLIENT_SECRET`, and `LAYLO_API_KEY` (or
   `LAYLO_CREATOR_ID`) in a `.env` file themselves, and make sure `.env` is in
   `.gitignore`. The client id has the form `<userId>.<accessKey>`, so it
   always contains a dot.
3. **Mint a token and verify the customer** in one command. The token goes
   straight into a variable and is never printed, and a failed mint prints the
   error body instead. The body can be JSON or form-encoded.

   ```sh
   set -a; . ./.env; set +a
   RES=$(curl -sS -X POST https://events.laylo.com/api/v1/auth/token \
     --data-urlencode "client_id=$LAYLO_CLIENT_ID" \
     --data-urlencode "client_secret=$LAYLO_CLIENT_SECRET")
   TOKEN=$(printf '%s' "$RES" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
   [ -n "$TOKEN" ] || echo "token request failed: $RES"
   curl -sS https://events.laylo.com/api/v1/keys/verify \
     -H "Authorization: Bearer $TOKEN" \
     -H "X-Api-Key: $LAYLO_API_KEY"
   # {"apiKeyStatus":"valid","message":"API key verified successfully"}
   ```

   For a creator-id customer, send `-H "X-Creator-Id: $LAYLO_CREATOR_ID"`
   instead. It returns `"apiKeyStatus":"not_provided"`, since there is no key
   to check, which confirms the account is on the roster.

   Shell variables don't carry over between separate command runs, which is
   how most assistants execute commands. Keep the mint and every request that
   uses `$TOKEN` in the same command. Never print the token or paste its value
   into a later command.

4. **In code**, cache the token and reuse it until shortly before it expires:
   refresh a minute early, or halfway through its life when `expires_in` is
   under two minutes. Don't mint a token per request, because the token
   endpoint is rate limited.

### When verification fails

Errors come back as
`{ "error": { "code": "...", "message": "...", ... } }`.

| Status | Meaning and fix                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Malformed body or query. The `message` says what's wrong.                                                                                                                       |
| 401    | If `error.apiKeyStatus` is `"invalid"`, the customer key is wrong or revoked. Otherwise the token expired or the client credentials are bad: mint a fresh token and retry once. |
| 403    | The account has no paid Laylo plan, or the creator id isn't under the integration's account.                                                                                    |
| 404    | Unknown path, or a `dropId` that isn't one of the customer's drops.                                                                                                             |
| 429    | Rate limited. Wait for the `Retry-After` header (seconds), or `error.details.retryAfter`.                                                                                       |
| 5xx    | Laylo-side failure. Retry reads with backoff. See the retry rules below for writes.                                                                                             |

Include the `apigw-requestid` response header when
contacting Laylo support.

## Answering questions about an account

For a question like "how many RSVPs did we get last month?", pick the
endpoint, then make the call if you can run commands. If you can't, give the
user the exact command. Use curl unless the user is working in a particular
language.

```sh
# same command as the token mint in step 3 of SKILL.md
curl -sS -G https://events.laylo.com/api/v1/conversions/counts \
  -H "Authorization: Bearer $TOKEN" -H "X-Api-Key: $LAYLO_API_KEY" \
  --data-urlencode "action=RSVP" \
  --data-urlencode "startDate=2026-08-01T00:00:00-07:00" \
  --data-urlencode "endDate=2026-08-31T23:59:59-07:00"
```

Common mappings:

- "Which drops are live?" → `GET /v1/drops`
- "How many SMS subscribers in California signed up this year?" →
  `GET /v1/fans/segments` with `signUpType=sms`,
  `locations={"country":"US","state":"CA"}`, and
  `signedUpAfter=2026-01-01T00:00:00Z`
- "Is fan@example.com still subscribed?" → `POST /v1/fans/subscribed` with
  `{"email":"fan@example.com"}`
- "Ticket sales this week?" → `GET /v1/conversions/counts` with
  `action=TICKET_PURCHASE&startDate=…`
- "Which artists can I act as?" → `GET /v1/customers`, then send each `id` as
  `X-Creator-Id`

## Rules to follow

- **Keep secrets out of the chat.** Ask the user to put credentials in `.env`
  instead of pasting them. If they paste one anyway, write it to `.env` for
  them rather than asking them to redo it, and mention that a secret shared in
  a chat is worth rotating if the conversation is stored or shared. Never echo
  a secret, key, or token back, and never hard-code one in a source file.
- **Keep tokens in memory.** Hold the access token in a shell variable or in
  the program. Never write it to a file, including temp files.
- **Confirm writes first.** `POST /v1/fans/subscriptions` and
  `POST /v1/conversions/events` change real fan data. Show the user the exact
  request body and get a yes before sending either to a live account. Reads,
  including the two `POST` subscription checks, can run freely.
- **Consent must be real.** Only subscribe someone who actually consented to
  marketing on that channel, with `consentGrantedAt` set to when they did.
  Subscribing a fan also clears an earlier unsubscribe, so never use it to
  re-add someone who opted out unless they opted in again.
- **Send one customer header.** Never send both `X-Api-Key` and
  `X-Creator-Id`.

## Wire conventions

- **Arrays in query strings** repeat the key: `action=RSVP&action=PURCHASE`.
- **Location filters** are JSON objects, URL-encoded, one per repeated key:
  `locations=%7B%22country%22%3A%22US%22%7D`. `curl -G --data-urlencode` does
  the encoding for you.
- **Empty filters:** leave a filter out entirely to switch it off. Never send
  an empty value.
- **Timestamps you send** are ISO 8601 with an explicit offset (`Z` or
  `-07:00`). Dates in drop and customer responses (`createdAt`, `endDate`) are
  Unix epoch **milliseconds**.
- **Phone numbers** are E.164, like `+12025550100`. Contact bodies carry
  exactly one of `email` or `phone`.
- **JSON bodies** need `Content-Type: application/json`.
- **Retries:** retry 408, 429, and 5xx for `GET`s and for the two subscription
  checks. Retry 429 for anything. Don't automatically replay
  `POST /v1/fans/subscriptions` or `POST /v1/conversions/events` after a 5xx,
  because the server may already have applied it. A tracked event with a
  stable `metadata.uniqueId` is merged on repeat, so a deliberate retry of
  that one is safe.
- `POST /v1/conversions/events` can return 200 with `"status":"failure"`, so
  check the body, not just the status code.
