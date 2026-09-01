# @laylo/node

The official Node.js SDK for the [Laylo public API](https://developers.laylo.com).

## Installation

```sh
npm install @laylo/node
```

## Usage

You authenticate with the integrator credentials from your Laylo dashboard,
plus the API key of the customer whose account you are acting on. The client
reads `LAYLO_CLIENT_ID`, `LAYLO_CLIENT_SECRET`, and `LAYLO_API_KEY` from the
environment when you do not pass them, and mints and refreshes access tokens
for you.

```ts
import Laylo from "@laylo/node";

const laylo = new Laylo();

const verified = await laylo.keys.verify();
console.log(verified.message);
```

CommonJS works the same way:

```js
const { Laylo } = require("@laylo/node");
```

### Serving several customers

One process can act for many Laylo accounts. Scope a client to a customer with
`forCustomer`, or pass that customer's key on the individual call:

```ts
const customer = laylo.forCustomer(customerApiKey);
await customer.drops.list();

await laylo.keys.verify({ apiKey: untrustedKey });
```

`keys.verify` is how you check a key a customer has just handed you before you
store it.

### Errors

Every failed call throws a subclass of `LayloError` carrying the status and the
API's error code, so you can branch on the kind of failure:

```ts
import { AuthenticationError, RateLimitError } from "@laylo/node";
```

Transient failures and rate limits are retried for you before they surface.

## Requirements

- Node.js 20 or later

## License

[MIT](./LICENSE)
