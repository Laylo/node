# Method reference

Every method returns a promise and takes an optional trailing
`RequestOptions`:

```ts
type RequestOptions = {
  apiKey?: string; // act as this customer for one call
  creatorId?: string; // or this roster account; never both; integrator only
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
  userId, // LAYLO_USER_ID
  accessKey, // LAYLO_ACCESS_KEY
  secretKey, // LAYLO_SECRET_KEY
  apiKey, // LAYLO_API_KEY, or:
  creatorId, // LAYLO_CREATOR_ID
  source, // optional, identifies your integration (X-Laylo-Source)
  timeoutMs, // default 30000
  maxRetries, // default 2
});

laylo.forCustomer("customer-api-key");
laylo.forCustomer({ apiKey: "..." });
laylo.forCustomer({ creatorId: "..." });

// For an account's own data, the API key alone (or LAYLO_API_KEY with no
// LAYLO_USER_ID, LAYLO_ACCESS_KEY, or LAYLO_SECRET_KEY set):
const own = new Laylo({ apiKey });
```

With none of `userId`, `accessKey`, and `secretKey` set, the client sends only
`X-Api-Key`, with no access token. It is limited to 20 requests a minute per
account by default (Laylo can raise the limit on a specific key, which then
gets its own budget), `creatorId` throws `LayloConfigurationError` wherever it's passed,
and `customers.list()` and `auth.createToken()` reject with
`LayloConfigurationError` before any request. Setting some but not all of the
three is a construction error. Naming any of them in code, even as `""`, turns
their environment variables off for all three; passing them as `undefined`
with none in the environment is also a construction error.

Each key-only call also needs a permission on the key: "write" for
`fans.subscribe`, `conversions.events.track`, `messages.sms.send`, and
`messages.segments.send` / `.schedule`, "read"
for everything else except `keys.verify()`, which needs none. "write" doesn't
grant "read", and a key with none stored can only read (an empty list allows
only `keys.verify()`). A missing one throws `PermissionError`
(`This API key does not have the "write" permission`). Keys can't be granted
"write" yet, so key-only writes aren't available for now.

CommonJS: `const { Laylo } = require("@laylo.com/node");`

## keys.verify()

Checks the customer resolves. Pass `{ apiKey }` in the options to check a key
a customer just gave you before you store it.

Returns `{ apiKeyStatus: "valid" | "not_provided", message: string }`. An
invalid key throws `AuthenticationError` with `apiKeyStatus === "invalid"`. A
valid key on an account without a paid plan, or on a locked account, throws `PermissionError`.

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
milliseconds. Needs integrator credentials; with only an API key it throws
`PermissionError`.

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
  action: Exclude<ConversionAction, "RSVP">;
  name: string; // non-empty, e.g. "VIP ticket"
  timestamp: Date | string; // when it happened
  metadata: {
    uniqueId?: string; // idempotency key; repeats are merged
    productId?: string;
    currency?: string;
    totalPrice?: number;
    totalCost?: number;
    city?: string; // with country, attaches the location to the fan
    state?: string;
    country?: string;
    [key: string]: unknown; // stored, not shown in the Laylo UI
  };
  user: {
    // need email or phone
    email?: string;
    phone?: string; // E.164
    emailMarketingConsent?: boolean;
    smsMarketingConsent?: boolean;
    [key: string]: unknown; // stored, not echoed back
  };
  consentGrantedAt?: string; // ISO 8601 with offset
  sessionId?: string;
  source?: string; // defaults to the X-Laylo-Source header, then the API key's label
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
  | { email: string; dropId?: string }
  | { phone: string; dropId?: string }
  | { email: string; phone: string; dropId?: string };
```

With both, each channel is subscribed and the two records are linked as the
same person. Each keeps its own id, returned as `emailFanId` and `phoneFanId`.
If only one subscribes, the other comes back in `rejected` with its `channel`,
`code`, and `message`.

The fan's sign-up time is the time of the call. `consentGrantedAt`,
`emailMarketingConsent`, and `smsMarketingConsent` are deprecated: they're
still accepted so older code compiles, but they aren't sent. Passing either
flag as `false` throws `LayloConfigurationError`, since subscribing would opt
the fan in anyway.
`dropId` also RSVPs the fan. It must be one of the customer's drops, or the
call throws `NotFoundError` and writes nothing. Subscribing an existing fan
refreshes their record and clears any earlier unsubscribe.

Returns:

```ts
type SubscribeFanResponse = {
  subscribed: boolean;
  emailFanId?: string; // only when email was given
  phoneFanId?: string; // only when phone was given
  rsvp?: { dropId: string; status: "confirmed" }; // only when dropId was given
};
```

## messages.sms.send(sms)

```ts
type SendSmsRequest = {
  message: string; // up to 1,600 characters, same text for every recipient
  to: string | string[]; // E.164; an array holds 1 to 200 numbers
};
```

Only numbers that currently subscribe to the customer are texted. An invalid
number, or one in a country Laylo doesn't send SMS to, throws
`BadRequestError` and nothing is sent. An empty `to` array or more than 200
numbers throws `LayloConfigurationError` before any request. A customer
without a Laylo phone number throws `ConflictError`.

Returns:

```ts
type SendSmsResponse = {
  queued: number; // messages accepted; billed per SMS segment, not per message
  skipped: {
    index: number; // position in `to`; 0 when `to` is a string
    reason: "not_subscribed" | "duplicate" | "queue_failed";
  }[];
};
```

It isn't retried on a 5xx. Retrying only the `queue_failed` recipients is safe.

## messages.segments.send(input) / messages.segments.schedule(input)

```ts
type SendSegmentMessageInput = {
  message: string; // up to 1,600 characters
  segment: {
    signUpType: "sms" | "email"; // required
    dropIds?: string[];
    excludedDropIds?: string[];
    conversionIds?: string[];
    excludedConversionIds?: string[];
    locations?: SegmentLocation[];
    excludedLocations?: SegmentLocation[];
    signedUpAfter?: Date | string; // send at most one of these two
    signedUpBefore?: Date | string;
  };
  timezone: SegmentMessageTimezone; // one of 57 IANA zones, like "America/New_York"
  email?: SegmentMessageEmail; // required for an "email" segment, refused for "sms"
  dryRun?: boolean; // true: validate and estimate the cost, send nothing
};

type SegmentMessageEmail = {
  subject: string; // up to 255 characters
  ctaUrl?: string; // main button: absolute http(s) URL; send with ctaText
  ctaText?: string; // up to 50 characters; send with ctaUrl
};

type ScheduleSegmentMessageInput = SendSegmentMessageInput & {
  sendAt: string; // local time in `timezone`, no offset: "2026-11-20T19:00"
};
```

`send` goes out within about five minutes. `schedule` needs `sendAt` at least
5 minutes and at most 2 years away and rounds it up to the next five-minute
mark. A time skipped by daylight saving is rejected. The segment uses the
same filters as `fans.segments.count` and matches the same fans. Every drop
and conversion id must belong to the customer. Recipients are worked out when
the message sends.

An `"sms"` segment is texted. An `"email"` segment is emailed: Laylo lays the
email out from `message` the way the dashboard's message composer does, and
its links become buttons. `ctaUrl` and `ctaText` add a main button, with the
first link in `message` as a second one unless it's the same URL.

`dryRun: true` validates the request like a real one and returns the
estimate without creating or sending anything. It skips the phishing screen,
so only a real send can be flagged, and it ignores the idempotency key.

A `signUpType` other than `"sms"` or `"email"`, an email segment without
`email` (or `email` on an SMS segment), or a segment with both
`signedUpAfter` and `signedUpBefore` throws `LayloConfigurationError` before any request. A bad field, id, location, `timezone`, or `sendAt` throws
`BadRequestError`. A message flagged as possible phishing or scam content
throws `PermissionError`, isn't sent, and locks the account for review. If
Laylo can't work out the estimate it throws `ServerError` (503) and nothing is
sent; with an idempotency key the SDK retries it.

Returns:

```ts
type SegmentMessage = {
  id: string | null; // null for a dry run
  dryRun: boolean;
  note: string; // for people to read; don't parse it
  sendAt: string; // ISO 8601 UTC
  estimate: {
    recipients: number; // fans who match the segment right now
    smsSegments: number; // per text, after the link, name, and suffix are added
    credits: number;
    costUsd: number; // free or prepaid credits aren't subtracted
    disclaimer: string; // show it alongside the numbers; don't parse it
    channels: {
      domesticSms: EstimateChannel; // US and Canadian numbers
      internationalSms: EstimateChannel;
      emails: EstimateChannel; // fans with a phone too are also under a text channel
    };
  };
};

type EstimateChannel = {
  recipients: number;
  creditsPerRecipient: number; // texts: the account's per-segment price × smsSegments
  credits: number;
};
```

Pass `{ idempotencyKey }` (1 to 255 printable ASCII characters, no space at
either end) in the options to make it safe to retry: a repeat with the same
key and body within 24 hours returns the first response. With a key the SDK
retries a 5xx, a dropped connection, and a 409 from an attempt that hasn't
finished. A `ConflictError` after that means the first attempt is still
running and will probably send; don't retry under a new key. Calling again
with the same key returns its response once it finishes, but if it never
finishes the key frees up after a minute and the next call sends again. A
dry run is retried like a read, with or without a key. A timeout is never retried
automatically, so retry it with the same key. The same key with a different
body throws a 422 `LayloAPIError`, and a malformed key throws
`LayloConfigurationError` before any request. Without a key it isn't retried
on a 5xx or a dropped connection.

## billing.creditUsage.get(params?)

| Param       | Type                          | Default                    |
| ----------- | ----------------------------- | -------------------------- |
| `startDate` | `string` (UTC day, inclusive) | first of `endDate`'s month |
| `endDate`   | `string` (UTC day, inclusive) | today                      |
| `interval`  | `"day" \| "week" \| "month"`  | `"day"`                    |

Days are `"YYYY-MM-DD"` strings; a `Date` isn't accepted, so convert it to
the UTC day you mean. The window can span at most 366 days.

Returns:

```ts
type CreditUsageReport = {
  startDate: string; // the window actually applied, YYYY-MM-DD
  endDate: string;
  interval: "day" | "week" | "month";
  rates: {
    creditsPerDollar: number;
    domesticSms: number; // credits per billed unit on each channel
    emails: number;
    instagram: number;
    internationalSms: number;
    mms: number;
  };
  series: CreditUsageBucket[]; // every bucket in the window, oldest first
  total: CreditUsage;
};

type CreditUsage = {
  count: number;
  credits: number;
  costUsd: number;
  channels: Record<
    CreditChannel,
    { count: number; credits: number; costUsd: number }
  >;
};

type CreditUsageBucket = CreditUsage & { start: string }; // YYYY-MM-DD
```

Weeks start on Monday and months on the 1st, except the first bucket, which
starts at `startDate`. `count` is billed units, not messages: most texts count
once per segment. `internationalSms` includes WhatsApp. Credits are priced at
the customer's current `rates`, and `costUsd` is rounded to the cent, so
rounded costs can be off by a few cents when summed. Prepaid and free credits
aren't applied.

## billing.creditUsage.getForProducts(params)

The same params plus `productIds: string[]`, required: 1 to 50 distinct drop
or segment message ids. Repeats are sent once. Resolves to the same report
summed across them, plus `productIds`. A drop includes its sub-drops. An
empty `productIds` throws `LayloConfigurationError`. More than 50 distinct
ids, or drops that expand to more than 200 products with their sub-drops,
throw `BadRequestError`; a product the customer doesn't own throws
`NotFoundError`.

## auth.createToken()

Returns `{ access_token: string; expires_in: number; token_type: "Bearer" }`.
Only needed to call the HTTP API directly. The SDK handles tokens itself.
Rejects with `LayloConfigurationError` on a client with only an API key.

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
