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
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
  apiKey: process.env.LAYLO_API_KEY,
});

await laylo.keys.verify();

const drops = await laylo.drops.list();
console.log(drops.map((drop) => drop.title));
```

## Using an AI assistant

If you work with Claude, Codex, or another assistant that reads
[Agent Skills](https://agentskills.io), the [`skills/`](./skills) folder has two
you can install. They walk you through getting credentials into a `.env` and
verifying them, help you choose between an API key and a creator id, and answer
questions about an account ("how many SMS subscribers signed up in August?")
by writing and running the call for you. Both ask before anything that writes
fan data.

- [`laylo-node`](./skills/laylo-node) uses this SDK.
- [`laylo-api`](./skills/laylo-api) calls the HTTP API directly, for other
  languages or plain curl.

[skills/README.md](./skills/README.md) has install steps for Claude Code, the
Claude apps, Codex, and other assistants.

## Authentication

The SDK uses two kinds of credentials:

- **Integrator credentials** — a `clientId` and `clientSecret` issued to
  your integration. Request these from your account manager.
  The SDK uses them to mint and refresh a bearer access token for you; you
  never handle the token directly.
- **Customer API key** — the `apiKey` of the Laylo account you're acting on
  behalf of. Each customer generates their own at
  [laylo.com/settings?tab=Integrations](https://laylo.com/settings?tab=Integrations)
  and gives it to you. It's sent as the `X-Api-Key` header on every request.

All three fall back to an environment variable when omitted from the
constructor: `LAYLO_CLIENT_ID`, `LAYLO_CLIENT_SECRET`, and `LAYLO_API_KEY`.

Enterprise accounts have a third option for naming the customer. If the
account you're acting on sits under your integration's own Laylo account, pass
its user id as `creatorId` instead of collecting an API key from it. It's sent
as the `X-Creator-Id` header, and falls back to `LAYLO_CREATOR_ID`. Set one of
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
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
  must still be named like on every other call.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const isUnsubscribed = await laylo.fans.isUnsubscribed({
    email: "fan@example.com",
  });
  ```

- [`fans.subscribe(fan, options?)`](https://developers.laylo.com/api-reference/fans/fans.subscriptions.create) —
  subscribes a fan to the customer with an explicit marketing-consent record:
  an `email` with `emailMarketingConsent: true`, or an E.164 `phone` with
  `smsMarketingConsent: true`, plus `consentGrantedAt` as a `Date` or an ISO
  8601 string carrying an explicit UTC offset. Pass `dropId` to also RSVP
  them to one of the customer's drops. This is a write, so it isn't retried
  on a server error.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const { fan, rsvp } = await laylo.fans.subscribe({
    email: "fan@example.com",
    emailMarketingConsent: true,
    consentGrantedAt: new Date(),
    dropId: "drop_123",
  });
  console.log(fan.id, rsvp?.status);
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
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const smsFans = await laylo.fans.segments.count({
    signUpType: "sms",
    dropIds: ["drop_123"],
    locations: [{ country: "US" }],
    signedUpAfter: new Date("2026-01-01T00:00:00Z"),
  });
  ```

The SDK mints and refreshes access tokens for you, but `laylo.auth.createToken()`
is available if you need a raw bearer token to call the API outside the SDK.

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
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
idempotent, such as `fans.isSubscribed` and `fans.isUnsubscribed`. A
non-idempotent write like `conversions.events.track` or `fans.subscribe` is
not replayed on a `5xx`, since the server may already have applied it. Each
request also has a `DEFAULT_TIMEOUT_MS` (30,000ms) timeout.

`maxRetries` and the default `timeoutMs` are set once, on the client. Per
call, you can override the timeout, disable retries for just that call with
`retry: false`, or abort it with an `AbortSignal`:

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
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
