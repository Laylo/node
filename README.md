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

```ts
import Laylo from "@laylo.com/node";

// Reads LAYLO_CLIENT_ID, LAYLO_CLIENT_SECRET, and LAYLO_API_KEY from the
// environment.
const laylo = new Laylo();

await laylo.keys.verify();
```

See [developers.laylo.com/authentication](https://developers.laylo.com/authentication)
for the full model.

## Working with multiple customers

A single process can act for many Laylo accounts. There are three ways to
supply the customer `apiKey`, in increasing order of precedence:

1. The constructor's `apiKey` — the default for every call this client makes.
2. `laylo.forCustomer(apiKey)` — a view that shares the parent client's
   connections and access token but uses a different customer key.
3. The trailing `RequestOptions` argument on any resource method — overrides
   both, for the one call.

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

## Resources

Every resource method's last argument is an optional
[`RequestOptions`](#retries--timeouts) for per-call overrides (`auth.createToken`
is the one exception — it only accepts `signal`).

### `keys`

- [`keys.verify(options?)`](https://developers.laylo.com/api-reference/users/keys.verify) —
  checks that a customer API key is valid; the way to validate a key a
  customer just gave you before you store it.

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
    }
    throw error;
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

- [`conversions.definitions.create(definition, options?)`](https://developers.laylo.com/api-reference/conversions/conversions.definition.create) —
  creates a conversion definition idempotently; creating the same
  action/name pair again returns the existing one.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const vipTicket = await laylo.conversions.definitions.create({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
    relatedProductId: "drop_123",
  });
  ```

- [`conversions.definitions.retrieve(params, options?)`](https://developers.laylo.com/api-reference/conversions/conversions.definition.get) —
  retrieves one conversion definition by its exact action and name.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const vipTicket = await laylo.conversions.definitions.retrieve({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
  });
  ```

- [`conversions.events.list(params, options?)`](https://developers.laylo.com/api-reference/conversions/conversions.events.list) —
  lists the tracked events for one conversion definition. See
  [Pagination](#pagination).

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const events = await laylo.conversions.events.list({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
    limit: 100,
  });
  for await (const { fan, event } of events) {
    console.log(fan.id, event.count, new Date(event.createdAt));
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

- [`fans.segments.count(configuration, options?)`](https://developers.laylo.com/api-reference/fans/fans.segments.search) —
  counts the fans matching a segment configuration.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  // SMS fans who purchased drop A but not drop B
  const numberOfFans = await laylo.fans.segments.count({
    signUpType: "sms",
    dropIds: ["drop_A"],
    excludedDropIds: ["drop_B"],
  });
  ```

### `messages`

- [`messages.scheduled.list(options?)`](https://developers.laylo.com/api-reference/messages/messages.scheduled.list) —
  lists the customer's drops whose drop-day message is still scheduled to
  go out.

  ```ts
  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const scheduled = await laylo.messages.scheduled.list();
  for (const drop of scheduled) {
    console.log(
      drop.title,
      drop.endDate === null ? null : new Date(drop.endDate),
    );
  }
  ```

The SDK mints and refreshes access tokens for you, but `laylo.auth.createToken()`
is available if you need a raw bearer token to call the API outside the SDK.

## Pagination

Methods that return a `Page`, like `conversions.events.list`, fetch one page
at a time but can be walked further without you tracking cursors:

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
  apiKey: process.env.LAYLO_API_KEY,
});

const page = await laylo.conversions.events.list({
  action: "TICKET_PURCHASE",
  name: "VIP ticket",
  limit: 100,
});

// Every page, fetched as you go
for await (const { fan, event } of page) {
  console.log(fan.id, event.count);
}

// Step through manually
const next = await page.nextPage();

// Collect with a safety cap
const first500 = await page.toArray({ maxItems: 500 });
```

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
idempotent, such as `fans.isSubscribed` and `fans.segments.count`. A
non-idempotent write like `conversions.events.track` is not replayed on a
`5xx`, since the server may already have applied it. Each request also has a
`DEFAULT_TIMEOUT_MS` (30,000ms) timeout.

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
