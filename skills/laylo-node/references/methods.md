# Method reference

Every method returns a promise and takes an optional trailing
`RequestOptions`:

```ts
type RequestOptions = {
  apiKey?: string; // act as this customer for one call
  creatorId?: string; // or this roster account; never both
  signal?: AbortSignal;
  timeoutMs?: number; // default 30000
  retry?: boolean; // false disables retries for this call
};
```

`auth.createToken` accepts only `signal`.

Precedence for naming the customer: per-call options, then
`forCustomer(...)`, then the constructor or environment.

## Client

```ts
import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  clientId, // LAYLO_CLIENT_ID
  clientSecret, // LAYLO_CLIENT_SECRET
  apiKey, // LAYLO_API_KEY, or:
  creatorId, // LAYLO_CREATOR_ID
  source, // optional, identifies your integration (X-Laylo-Source)
  timeoutMs, // default 30000
  maxRetries, // default 2
});

laylo.forCustomer("customer-api-key");
laylo.forCustomer({ apiKey: "..." });
laylo.forCustomer({ creatorId: "..." });
```

CommonJS: `const { Laylo } = require("@laylo.com/node");`

## keys.verify()

Checks the customer resolves. Pass `{ apiKey }` in the options to check a key
a customer just gave you before you store it.

Returns `{ apiKeyStatus: "valid" | "not_provided", message: string }`. An
invalid key throws `AuthenticationError` with `apiKeyStatus === "invalid"`. A
valid key on an account without a paid plan throws `PermissionError`.

## customers.list()

Returns the accounts under the integration's own Laylo account, sorted by
display name:

```ts
type CustomerAccount = {
  id: string;
  displayName: string | null;
  username: string | null;
  createdAt: number | null;
};
// returns CustomerAccount[]
```

`id` is the value `forCustomer({ creatorId })` accepts. `createdAt` is epoch
milliseconds.

## drops.list()

Returns the customer's active public drops:

```ts
type Drop = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isMultidrop: boolean;
  createdAt: number; // epoch ms
  endDate: number | null; // drop day, epoch ms
  dropDayMessage: string | null; // sent to fans on the drop day
};
// returns Drop[]
```

## conversions.list(params?)

| Param              | Type                                     |
| ------------------ | ---------------------------------------- |
| `action`           | `ConversionAction \| ConversionAction[]` |
| `relatedProductId` | `string`                                 |

Returns `{ id: string; action: ConversionAction; name: string }[]`. `id` has
the form `customerId:action:name`. An empty `action` array throws. Leave the
param out to include every action.

## conversions.counts.list(params?)

| Param       | Type                                     | Default            |
| ----------- | ---------------------------------------- | ------------------ |
| `action`    | `ConversionAction \| ConversionAction[]` | all actions        |
| `startDate` | `Date \| string` (inclusive)             | 28 days before end |
| `endDate`   | `Date \| string` (inclusive)             | now                |

Returns:

```ts
type ConversionCountsReport = {
  startDate: string; // the window actually applied, ISO UTC
  endDate: string;
  counts: {
    action: ConversionAction;
    total: number;
    series: { time: string; count: number }[]; // one per day, oldest first
  }[];
};
```

Actions with no events in the window are omitted. Days follow the Pacific
calendar. Counts are events, not distinct fans.

## conversions.events.track(event)

```ts
type TrackConversionEventInput = {
  action: ConversionAction;
  name: string; // non-empty, e.g. "VIP ticket"
  timestamp: Date | string; // when it happened
  metadata: {
    uniqueId?: string; // idempotency key; repeats are merged
    productId?: string;
    currency?: string;
    totalPrice?: number;
    totalCost?: number;
    [key: string]: unknown;
  };
  user: {
    // need one of email, phone, or fingerprintId
    email?: string;
    phone?: string; // E.164
    fingerprintId?: string;
    isAnonymous?: boolean;
    emailMarketingConsent?: boolean;
    smsMarketingConsent?: boolean;
  };
  consentGrantedAt?: string; // ISO 8601 with offset
  sessionId?: string;
  source?: string;
};
```

Returns `{ status: "success" | "failure", tracked }`. `tracked` echoes the
event with contact fields replaced by `hasEmail` and `hasPhone` flags.

## fans.isSubscribed(contact) / fans.isUnsubscribed(contact)

`contact` is exactly one of `{ email }` or `{ phone }` (E.164). Each returns a
`boolean`. `isUnsubscribed` is true only for a contact who subscribed at some
point and has since opted out. A contact who never subscribed is false for
both.

## fans.segments.count(filters)

| Filter                  | Type                | Notes                           |
| ----------------------- | ------------------- | ------------------------------- |
| `signUpType`            | `"sms" \| "email"`  | required                        |
| `dropIds`               | `string[]`          | fans who purchased any of these |
| `excludedDropIds`       | `string[]`          |                                 |
| `conversionIds`         | `string[]`          | from `conversions.list()`       |
| `excludedConversionIds` | `string[]`          |                                 |
| `locations`             | `SegmentLocation[]` |                                 |
| `excludedLocations`     | `SegmentLocation[]` |                                 |
| `signedUpAfter`         | `Date \| string`    | inclusive                       |
| `signedUpBefore`        | `Date \| string`    | exclusive                       |

`SegmentLocation` is one of `{ country }`, `{ country, state }`, or
`{ country, state, city, radius? }`. Array filters match any of their values,
and an empty array turns the filter off.

- `country` takes an ISO 3166-1 alpha-2 code such as `US` or `FR`.
- `state` takes a state or province code for the US, Canada, and Australia
  (`NY`, `ON`, `NSW`). Elsewhere, use the region's name.
- `city` takes the city's name. Add `radius` to include everywhere within
  that many miles of the city.

Returns a `number`: the count of matching fans.

## fans.subscribe(fan)

One of:

```ts
type SubscribeFanInput =
  | {
      email: string;
      emailMarketingConsent: true;
      consentGrantedAt: Date | string;
      dropId?: string;
    }
  | {
      phone: string;
      smsMarketingConsent: true;
      consentGrantedAt: Date | string;
      dropId?: string;
    };
```

`consentGrantedAt` becomes the sign-up time and can't be in the future.
`dropId` also RSVPs the fan. It must be one of the customer's drops, or the
call throws `NotFoundError` and writes nothing. Subscribing an existing fan
refreshes their record and clears any earlier unsubscribe.

Returns:

```ts
type SubscribeFanResponse = {
  subscribed: boolean;
  fan: {
    id: string;
    inferredDisplayName?: string;
    joinedAt?: string;
    location?: { city?: string; state?: string; country?: string };
  };
  rsvp?: { dropId: string; status: "confirmed" }; // only when dropId was given
};
```

## auth.createToken()

Returns `{ access_token: string; expires_in: number; token_type: "Bearer" }`.
Only needed to call the HTTP API directly. The SDK handles tokens itself.

## ConversionAction values

`PURCHASE`, `STORE_PURCHASE`, `TICKET_PURCHASE`, `CHECK_IN`, `ADD_TO_CART`,
`LINK_CLICK`, `UPSELL_CLICK`, `UPSELL_REMINDER_CLICK`, `VIP_CLICK`, `RSVP`,
`OPT_OUT`, `DIRECT_MESSAGE`, `CALL`, `FOLLOW`, `SOCIAL_ENGAGEMENT`,
`WAITLIST_SIGNUP`, `SECONDARY_LISTING_CREATED`, `ABANDONED_CART_CLICK`,
`TICKET_SALES_CLICK`, `ABANDONED_CART_CREATED`, `ABANDONED_CART_UPDATED`,
`FORM_SUBMISSION`, `QUESTION_RESPONSE`

## Errors

All errors extend `LayloError`. API responses throw `LayloAPIError`
subclasses: `BadRequestError` (400), `AuthenticationError` (401),
`PermissionError` (403), `NotFoundError` (404), `MethodNotAllowedError`
(405), `ConflictError` (409), `RateLimitError` (429, `retryAfter`),
`NotImplementedError` (501), `ServerError` (5xx). Non-HTTP errors are
`LayloConnectionError`, `LayloTimeoutError`, and `LayloConfigurationError`
(bad client or call setup, thrown before any request).

```ts
import { LayloAPIError, RateLimitError } from "@laylo.com/node";
```
