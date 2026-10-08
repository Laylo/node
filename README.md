# @laylo.com/node

The official Node.js SDK for the [Laylo public API](https://developers.laylo.com).

[![npm version](https://img.shields.io/npm/v/@laylo.com/node)](https://www.npmjs.com/package/@laylo.com/node)
[![CI](https://github.com/Laylo/node/actions/workflows/ci.yml/badge.svg)](https://github.com/Laylo/node/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@laylo.com/node)](https://www.npmjs.com/package/@laylo.com/node)
[![license](https://img.shields.io/npm/l/@laylo.com/node)](./LICENSE)

## Install

```sh
npm install @laylo.com/node
# or
pnpm add @laylo.com/node
# or
yarn add @laylo.com/node
```

## Quickstart

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
  apiKey: process.env.LAYLO_API_KEY,
});

await laylo.keys.verify();

const drops = await laylo.drops.list();
console.log(drops.map((drop) => drop.title));
```

Calling only your own account's data? The API key on its own is enough; see
[Using only an API key](#using-only-an-api-key).

## Using an AI assistant

This repo is also a plugin for AI coding assistants. It carries two
[Agent Skills](https://agentskills.io) that walk you through getting
credentials into a `.env` and verifying them, help you choose between an API
key and a creator id, and answer questions about an account ("how many SMS
subscribers signed up in August?") by writing and running the call for you.
Both ask before anything that writes fan data.

- [`laylo-node`](./skills/laylo-node) uses this SDK.
- [`laylo-api`](./skills/laylo-api) calls the HTTP API directly, for other
  languages or plain curl.

Installing the plugin gets you both; the assistant picks whichever fits the
project.

**Claude Code.** Add the marketplace, then install the plugin:

```sh
claude plugin marketplace add Laylo/node
claude plugin install laylo@laylo-skills
```

Or from inside a session, run `/plugin marketplace add Laylo/node` and pick
`laylo` from `/plugin`.

**Codex.** Add the marketplace, then install the plugin, and start a new
thread:

```sh
codex plugin marketplace add Laylo/node
codex plugin add laylo@laylo-skills
```

**Cursor.** On a Teams or Enterprise plan, go to **Dashboard → Plugins & MCPs
→ Team Marketplaces → Add Marketplace → Import from Repo** and paste
`https://github.com/Laylo/node`. On your own, clone the repo into Cursor's
local plugins folder and run **Developer: Reload Window**:

```sh
git clone https://github.com/Laylo/node ~/.cursor/plugins/local/laylo
```

**Anything else.** The plugin follows the
[Agent Plugins](https://agent-plugins.org) layout, so tools that read it, such
as GitHub Copilot and VS Code, can load this repo directly. For the skills on
their own, `npx skills add Laylo/node` installs them into most assistants.
[skills/README.md](./skills/README.md) covers the Claude desktop app,
claude.ai, and copying the folders by hand.

## Authentication

The SDK uses two kinds of credentials:

- **Integrator credentials** — a `userId`, `accessKey`, and `secretKey`
  issued to your integration. The `userId` is the Laylo user id of the
  account the credentials were issued under.
  The SDK uses them to mint and refresh a bearer access token for you; you
  never handle the token directly.
- **Customer API key** — the `apiKey` of the Laylo account you're acting on
  behalf of. Each customer generates their own under **Settings →
  Integrations → API Keyring** at
  [laylo.com/settings?tab=Integrations](https://laylo.com/settings?tab=Integrations)
  and gives it to you. It's sent as the `X-Api-Key` header on every request.

Each falls back to an environment variable when omitted from the
constructor: `LAYLO_USER_ID`, `LAYLO_ACCESS_KEY`, `LAYLO_SECRET_KEY`, and
`LAYLO_API_KEY`. An integration acting for many customers needs the
integrator credentials; a single account calling its own data can skip them
and [use only an API key](#using-only-an-api-key).

Enterprise accounts have a third option for naming the customer. If the
account you're acting on sits under your integration's own Laylo account, pass
its user id as `creatorId` instead of collecting an API key from it. It's sent
as the `X-Creator-Id` header, falls back to `LAYLO_CREATOR_ID`, and needs
integrator credentials. Set one of
`apiKey` or `creatorId`, not both — including in the environment, where having
`LAYLO_API_KEY` and `LAYLO_CREATOR_ID` both set fails at construction rather
than picking one. See
[Acting on accounts under your own](#acting-on-accounts-under-your-own).

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo();

await laylo.keys.verify();
```

See [developers.laylo.com/authentication](https://developers.laylo.com/authentication)
for the full model.

### Getting your keys

1. Ask your Laylo account manager to turn on integrator access for your
   Laylo account. This is the one step you can't do yourself.
2. Open
   [laylo.com/settings?tab=Integrations](https://laylo.com/settings?tab=Integrations)
   and scroll to **Integrator API Keys**. The card shows your user ID; that's
   your `userId`.
3. Create a key. The dialog shows your user ID, access key, and secret key
   together. Copy them into your `.env` now as `LAYLO_USER_ID`,
   `LAYLO_ACCESS_KEY`, and `LAYLO_SECRET_KEY`: the secret key is shown only
   once, and losing it means deleting the key and creating a new one.
4. To test before you have a customer, generate a key in the **API Keyring**
   card on the same page and set it as `LAYLO_API_KEY`. Your integration
   then acts on your own Laylo account, so you can try it against your own
   drops and fans before onboarding anyone else.

Writes made this way are live. Integrator calls aren't limited by the key's
permissions, so `messages.sms.send` and `messages.segments` text your real fans and
`fans.subscribe` and `conversions.events.track` create real records. Stick
to reads, or send only to your own number, until you mean it.

### Using only an API key

If you're a Laylo account calling your own data — a script, a backend for your
own site — you don't need integrator credentials. Generate an API key at
[laylo.com/settings?tab=Integrations](https://laylo.com/settings?tab=Integrations)
and pass it on its own, or set only `LAYLO_API_KEY` and call `new Laylo()`:

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({ apiKey: process.env.LAYLO_API_KEY });

const drops = await laylo.drops.list();
```

The client works this way whenever none of `userId`, `accessKey`, and
`secretKey` is set; setting some but not all of them still fails at
construction. Naming any of the three in code, even as `""`, turns their
environment variables off for all three, so `new Laylo({ apiKey, userId: "" })`
ignores a stray `LAYLO_USER_ID`. Passing them as `undefined`, as in the
quickstart, counts as expecting integrator credentials: if none turn up in the
environment either, construction fails rather than falling back to the API key
alone. To act for several accounts this way, construct with one account's key
and scope to the others with `forCustomer(apiKey)`. Every request carries just the `X-Api-Key` header, with no
access token. Compared with integrator credentials:

- Requests are limited to 20 a minute per account. Past that, a call throws
  `RateLimitError`, whose `retryAfter` says when to try again.
- Only the key's own account can be acted on. `creatorId` isn't accepted —
  not in the constructor, `LAYLO_CREATOR_ID`, `forCustomer`, or a call's
  options — and throws `LayloConfigurationError`. Another customer's key
  still works through `forCustomer(apiKey)` or a call's `apiKey`.
- `customers.list()` and `auth.createToken()` reject with
  `LayloConfigurationError` without sending a request, since there's no
  integrator roster to list or token to mint.
- The key's own permissions apply. Writes (`fans.subscribe`,
  `conversions.events.track`, `messages.sms.send`, `messages.segments.send`,
  `messages.segments.schedule`) need "write"; everything
  else, including `fans.isSubscribed` and `fans.isUnsubscribed`, needs "read",
  except `keys.verify()`, which any valid key can call. The two are
  independent, so "write" doesn't grant "read". A key with no permissions
  stored can only read, and one stored with an empty list can't make any call
  but `keys.verify()`. A call the key isn't allowed to make throws
  `PermissionError` with a message such as
  `This API key does not have the "write" permission`.
- Keys can't be granted "write" yet, so for now a client with only an API key
  is read-only: the three writes above throw `PermissionError`.

If you're building an integration that serves many customers, use integrator
credentials instead.

## Working with multiple customers

A single process can act for many Laylo accounts. There are three places to
name the customer, in increasing order of precedence:

1. The constructor's `apiKey` (or `creatorId`) — the default for every call
   this client makes.
2. `laylo.forCustomer(apiKey)` — a view that shares the parent client's
   connections and access token but acts as a different customer. It also
   takes `{ apiKey }` or `{ creatorId }`.
3. The trailing `RequestOptions` argument on any resource method — its
   `apiKey` or `creatorId` replaces the client's customer, for the one call.

A request handler serving several customers typically scopes per request:

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
});

const handleRequest = async (customerApiKey: string) => {
  const customer = laylo.forCustomer(customerApiKey);
  return customer.drops.list();
};

await handleRequest("customer-api-key");
```

## Acting on accounts under your own

If your integration was issued under an enterprise Laylo account, any account
on that roster can be named by its Laylo user id rather than by an API key. It
works at any depth of sub-account nesting, and your own account's id is
accepted too. It's the same set of accounts you can switch between when you
log in to Laylo on the web.

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
});

const artist = laylo.forCustomer({ creatorId: "artist-user-id" });
const drops = await artist.drops.list();
```

An id outside your roster throws `PermissionError`. An id on your roster whose
account no longer exists throws `AuthenticationError`, the same answer an API
key gives when its account is gone. `keys.verify()` still works for a
creator-id customer, but since there's no key to check it resolves with
`apiKeyStatus: "not_provided"`.

## Resources

Every resource method's last argument is an optional
[`RequestOptions`](#retries--timeouts) for per-call overrides (`auth.createToken`
is the one exception — it only accepts `signal`).

### `keys`

- [`keys.verify(options?)`](https://developers.laylo.com/api-reference/users/keys.verify) —
  checks that a customer API key is valid; the way to validate a key a
  customer just gave you before you store it. For a customer named by
  `creatorId` there is no key to check, so it confirms the account is on your
  roster and resolves with `apiKeyStatus: "not_provided"`.

  ```ts
  import Laylo, { AuthenticationError } from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
  });

  try {
    await laylo.keys.verify({ apiKey: "untrusted-key" });
  } catch (error) {
    if (
      error instanceof AuthenticationError &&
      error.apiKeyStatus === "invalid"
    ) {
      console.log("reject the key");
    } else {
      throw error;
    }
  }
  ```

### `customers`

- [`customers.list(options?)`](https://developers.laylo.com/api-reference/users/customers.list) —
  lists the accounts under your integration's own Laylo account. Each entry's
  `id` is the `creatorId` that `forCustomer({ creatorId })` accepts, so one
  customer is enough to discover the rest. The list is scoped to your
  integration, not to the customer the client is acting as, but a customer
  must still be named like on every other call. It needs integrator
  credentials; a client with only an API key gets `PermissionError`.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const customers = await laylo.customers.list();
  for (const customer of customers) {
    const drops = await laylo
      .forCustomer({ creatorId: customer.id })
      .drops.list();
    console.log(customer.displayName, drops.length);
  }
  ```

### `drops`

- [`drops.list(options?)`](https://developers.laylo.com/api-reference/drops/drops.list) —
  lists the customer's active public drops.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const drops = await laylo.drops.list();
  for (const drop of drops) {
    console.log(drop.title, new Date(drop.createdAt));
  }
  ```

### `conversions`

- [`conversions.list(params?, options?)`](https://developers.laylo.com/api-reference/conversions/conversions.list) —
  lists the customer's conversion definitions, optionally filtered by
  `action` and/or `relatedProductId`.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const purchases = await laylo.conversions.list({
    action: ["TICKET_PURCHASE", "STORE_PURCHASE"],
  });
  ```

- [`conversions.counts.list(params?, options?)`](https://developers.laylo.com/api-reference/conversions/conversions.counts.list) —
  counts the customer's conversion events per action over a window, with a
  daily series for each, the way the dashboard's Fan Activity chart does.
  Filter by `action` and bound the window with `startDate` and `endDate`,
  which accept a `Date` or an ISO 8601 string carrying an explicit UTC
  offset. The window defaults to the last 28 days.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const report = await laylo.conversions.counts.list({
    action: ["TICKET_PURCHASE", "RSVP"],
    startDate: new Date("2026-08-01T00:00:00Z"),
    endDate: new Date(),
  });
  for (const { action, total } of report.counts) {
    console.log(action, total);
  }
  ```

- [`conversions.events.track(event, options?)`](https://developers.laylo.com/api-reference/conversions/conversions.track) —
  tracks a conversion event for a fan. Repeated events with the same
  `metadata.uniqueId` are merged, so retrying is safe.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const { status, tracked } = await laylo.conversions.events.track({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
    timestamp: new Date(),
    metadata: { uniqueId: "order_123", currency: "USD", totalPrice: 59.5 },
    user: { email: "fan@example.com", emailMarketingConsent: true },
  });
  if (status === "failure") {
    console.log("queue for retry", tracked);
  }
  ```

### `fans`

- [`fans.isSubscribed(contact, options?)`](https://developers.laylo.com/api-reference/fans/fans.subscribed.check) —
  checks whether a contact (an email or an E.164 phone number) currently
  subscribes to the customer.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const isSubscribed = await laylo.fans.isSubscribed({ phone: "+12025550100" });
  ```

- [`fans.isUnsubscribed(contact, options?)`](https://developers.laylo.com/api-reference/fans/fans.unsubscribed.check) —
  checks whether a contact subscribed at some point and has since
  unsubscribed.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const isUnsubscribed = await laylo.fans.isUnsubscribed({
    email: "fan@example.com",
  });
  ```

- [`fans.subscribe(fan, options?)`](https://developers.laylo.com/api-reference/fans/fans.subscriptions.create) —
  subscribes a fan to the customer with an explicit marketing-consent record:
  an `email` with `emailMarketingConsent: true`, an E.164 `phone` with
  `smsMarketingConsent: true`, or both, plus `consentGrantedAt` as a `Date` or
  an ISO 8601 string carrying an explicit UTC offset. Given both, each is
  subscribed and the two records are linked as the same person; the result
  carries a separate `emailFanId` and `phoneFanId`. A blank `email` or
  `phone` throws rather than being skipped. Pass `dropId` to also
  RSVP them to one of the customer's drops. This is a write, so it isn't retried
  on a server error.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const { emailFanId, rsvp } = await laylo.fans.subscribe({
    email: "fan@example.com",
    emailMarketingConsent: true,
    consentGrantedAt: new Date(),
    dropId: "drop_123",
  });
  console.log(emailFanId, rsvp?.status);
  ```

- [`fans.segments.count(filters, options?)`](https://developers.laylo.com/api-reference/fans/fans.segments.list) —
  counts the customer's fans matching a segment, like the dashboard's
  audience builder. `signUpType` (`"sms"` or `"email"`) is required; narrow
  further by drops purchased, conversions, locations, and sign-up time, where
  `signedUpAfter` and `signedUpBefore` accept a `Date` or an ISO 8601 string
  carrying an explicit UTC offset. An empty array is left out of the request,
  so it switches that filter off rather than matching no fan.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const smsFans = await laylo.fans.segments.count({
    signUpType: "sms",
    dropIds: ["drop_123"],
    locations: [{ country: "US" }],
    signedUpAfter: new Date("2026-01-01T00:00:00Z"),
  });
  ```

### `messages`

- [`messages.sms.send(sms, options?)`](https://developers.laylo.com/api-reference/messages/messages.sms.send) —
  texts `message` from the customer's Laylo number to `to`, one E.164 phone
  number or an array of up to 200. Only numbers that currently subscribe to
  the customer get the text. It resolves to `{ queued, skipped }`, where
  `skipped` lists each recipient that wasn't texted by its index in `to`,
  with a reason of `"not_subscribed"`, `"duplicate"`, or `"queue_failed"`.
  An invalid number rejects the whole request. This is a write, so it isn't
  retried on a server error.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const to = ["+12025550100", "+12025550101"];
  const { queued, skipped } = await laylo.messages.sms.send({
    message: "Presale starts now: https://laylo.com/example",
    to,
  });
  for (const { index, reason } of skipped) {
    console.log(to[index], reason);
  }
  ```

- [`messages.segments.send(input, options?)`](https://developers.laylo.com/api-reference/messages/messages.segments.send) —
  texts `message` to every fan in `segment` within the next few minutes. The
  segment takes the same filters as `fans.segments.count`, as long as
  `signUpType` is `"sms"`. `timezone` is the IANA zone the message is
  written in, one of the zones in `SegmentMessageTimezone`. Recipients are worked out when the message sends, and only
  fans currently subscribed by SMS are texted. It resolves to
  `{ id, note, sendAt, dryRun, estimate }`, with `sendAt` in UTC and
  `estimate` giving the recipients, credits, and `costUsd` from the fans who
  match right now. Pass `dryRun: true` to get that estimate without sending
  anything; `id` is then null.
- [`messages.segments.schedule(input, options?)`](https://developers.laylo.com/api-reference/messages/messages.segments.schedule) —
  the same, sent at `sendAt`: a local date and time in `timezone` with no
  offset, like `"2026-11-20T19:00"`, at least 5 minutes and at most 2 years
  away. It's rounded up to the next five-minute mark.

  Both are writes, so they aren't retried on a server error unless you pass
  an `idempotencyKey` in the options. With one, a repeat within 24 hours
  returns the first response instead of sending the message twice, and the
  SDK retries server errors and dropped connections itself. A timeout isn't
  retried; call again with the same key. A `ConflictError` with a key means
  the first attempt is still running and will probably send, so don't retry
  under a new key. If that attempt never finishes, the key frees up after a
  minute and a call with it sends again. A dry run ignores the key, so the
  real send can reuse it, and is retried like a read. `signedUpAfter` and `signedUpBefore` can't be combined
  when messaging.

  ```ts
  import Laylo, { type ScheduleSegmentMessageInput } from "@laylo.com/node";

  const laylo = new Laylo({
    userId: process.env.LAYLO_USER_ID,
    accessKey: process.env.LAYLO_ACCESS_KEY,
    secretKey: process.env.LAYLO_SECRET_KEY,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const message: ScheduleSegmentMessageInput = {
    message: "Tickets go on sale tomorrow: https://laylo.com/example",
    segment: { signUpType: "sms", dropIds: ["drop_123"] },
    sendAt: "2026-11-20T19:00",
    timezone: "America/New_York",
  };

  const { estimate } = await laylo.messages.segments.schedule({
    ...message,
    dryRun: true,
  });
  console.log(
    `About ${String(estimate.recipients)} fans, $${String(estimate.costUsd)}`,
  );
  console.log(estimate.disclaimer);

  const { sendAt } = await laylo.messages.segments.schedule(message, {
    idempotencyKey: "tour-onsale-2026-11-20",
  });
  ```

The SDK mints and refreshes access tokens for you, but `laylo.auth.createToken()`
is available if you need a raw bearer token to call the API outside the SDK.
It needs integrator credentials; with only an API key, send the key as
`X-Api-Key` and no token.

## Errors

Every error the SDK throws is a subclass of `LayloError`. A failed API
response throws `LayloAPIError`, whose subclass is picked from the HTTP
status:

| Class                   | Status | When                                                     |
| ----------------------- | ------ | -------------------------------------------------------- |
| `BadRequestError`       | 400    | The request was malformed or failed validation.          |
| `AuthenticationError`   | 401    | Credentials are missing, expired, or invalid.            |
| `PermissionError`       | 403    | Authenticated, but not allowed to perform this action.   |
| `NotFoundError`         | 404    | The resource does not exist or isn't visible to you.     |
| `MethodNotAllowedError` | 405    | The HTTP method isn't supported on this route.           |
| `ConflictError`         | 409    | The request conflicts with the resource's current state. |
| `RateLimitError`        | 429    | Too many requests; see `retryAfter`.                     |
| `NotImplementedError`   | 501    | The endpoint exists but isn't available yet.             |
| `ServerError`           | 5xx    | Something went wrong on Laylo's side.                    |

Two more `LayloError` subclasses don't carry a status because they're never
an API response: `LayloConnectionError` (the request never got a response)
and `LayloTimeoutError` (the request exceeded its timeout). A fourth,
`LayloConfigurationError`, is thrown before any request is made, for a
misconfigured client or call.

```ts
import Laylo, { LayloAPIError, RateLimitError } from "@laylo.com/node";

const laylo = new Laylo({
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
  apiKey: process.env.LAYLO_API_KEY,
});

try {
  await laylo.drops.list();
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`retry after ${String(error.retryAfter)}s`);
  } else if (error instanceof LayloAPIError) {
    console.error(error.status, error.code, error.message);
  } else {
    throw error;
  }
}
```

## Retries & timeouts

A response with status `408`, `429`, `500`, `502`, `503`, or `504` is retried
automatically with exponential backoff, up to `DEFAULT_MAX_RETRIES` (2)
times. A `429` is retried regardless of method; the other statuses are only
retried for idempotent requests — reads, and writes the SDK itself marks
idempotent, such as `fans.isSubscribed` and `fans.isUnsubscribed`, and
`messages.segments` calls given an `idempotencyKey` (which also retry a `409`
from an attempt that hasn't finished). A non-idempotent write like
`conversions.events.track` or `fans.subscribe` is not replayed on a `5xx`,
since the server may already have applied it. Each
request also has a `DEFAULT_TIMEOUT_MS` (30,000ms) timeout.

`maxRetries` and the default `timeoutMs` are set once, on the client. Per
call, you can override the timeout, disable retries for just that call with
`retry: false`, or abort it with an `AbortSignal`:

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
  apiKey: process.env.LAYLO_API_KEY,
  maxRetries: 5,
  timeoutMs: 10_000,
});

const controller = new AbortController();
await laylo.drops.list({
  timeoutMs: 5_000,
  retry: false,
  signal: controller.signal,
});
```

## TypeScript

Import types alongside the client:

```ts
import Laylo, { type Drop, type Conversion } from "@laylo.com/node";

const laylo = new Laylo({
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
  apiKey: process.env.LAYLO_API_KEY,
});

const describeDrop = (drop: Drop): string => drop.title;
const drops: Drop[] = await laylo.drops.list();
console.log(drops.map(describeDrop));

const purchases: Conversion[] = await laylo.conversions.list({
  action: "TICKET_PURCHASE",
});
console.log(purchases.map((conversion) => conversion.name));
```

`ConversionAction` is a string literal union, so your editor autocompletes
the valid actions wherever one is expected.

Both module systems are supported:

```ts
import Laylo from "@laylo.com/node";
```

```js
const { Laylo } = require("@laylo.com/node");
```

## Requirements

- Node.js 20 or later

## Support

- Docs: [developers.laylo.com](https://developers.laylo.com)

## License

[MIT](./LICENSE)
