# Endpoint reference

Base URL: `https://events.laylo.com/api`. All responses are JSON. Every
endpoint except `POST /v1/auth/token` needs either:

- **Only an API key:** `X-Api-Key` and no `Authorization` header. The call
  acts as the key's own account, is limited to 20 requests a minute per
  account by default (Laylo can raise the limit on a specific key, which then
  gets its own budget), and can't use `X-Creator-Id`. It also needs the key to have the
  endpoint's permission: "write" for `POST /v1/fans/subscriptions`,
  `POST /v1/conversions/events`, `POST /v1/messages/sms`, and both
  `POST /v1/messages/segments` routes, "read" for the
  rest except `GET /v1/keys/verify`, which needs none. "write" doesn't grant
  "read", and a key with none stored can only read (an empty list allows only
  key verification). A missing one returns 403 `FORBIDDEN`
  (`This API key does not have the "write" permission`). Keys can't be
  granted "write" yet, so key-only writes aren't available for now.
- **Integrator credentials:** `Authorization: Bearer <token>` plus exactly one
  of `X-Api-Key` or `X-Creator-Id`.

## POST /v1/auth/token

Body (JSON or `application/x-www-form-urlencoded`):

```json
{ "client_id": "<userId>.<accessKey>", "client_secret": "<secretKey>" }
```

`client_id` is the integrator's user id and access key joined with a dot, and
`client_secret` is the secret key.

`grant_type` is accepted and ignored, so a stock OAuth client-credentials
helper works unchanged. No customer header is needed.

```json
{ "access_token": "…", "expires_in": 3600, "token_type": "Bearer" }
```

`expires_in` is in seconds, and a token can live as briefly as 60 seconds.
Mint a new one before it expires. Rate limited per caller address.

## GET /v1/keys/verify

```json
{ "apiKeyStatus": "valid", "message": "API key verified successfully" }
```

`apiKeyStatus` is `"not_provided"` when the customer is named by
`X-Creator-Id`, and `"valid"` for a good key sent on its own. A bad key returns 401 with `error.apiKeyStatus: "invalid"`.
A key on an account without a paid plan, or on a locked account, returns 403.

## GET /v1/customers

The accounts under the integration's own Laylo account, sorted by display
name. Scoped to the integration, but a customer header is still required.
Needs integrator credentials: with only an API key it returns 403
`FORBIDDEN`.

```json
[
  {
    "id": "creator_123",
    "displayName": "Laylo Records",
    "username": "laylorecords",
    "createdAt": 1722500000000
  }
]
```

`id` is the value to send as `X-Creator-Id`. `createdAt` is epoch ms, and it
and the two name fields may be `null`.

## GET /v1/drops

The customer's active public drops.

```json
[
  {
    "id": "drop_123",
    "title": "New album",
    "description": "Limited edition vinyl.",
    "imageUrl": "https://cdn.example.com/drop.png",
    "isMultidrop": false,
    "createdAt": 1722500000000,
    "endDate": null,
    "dropDayMessage": null
  }
]
```

`createdAt` and `endDate` (the drop day) are epoch ms.

## GET /v1/conversions

| Query              | Notes                                  |
| ------------------ | -------------------------------------- |
| `action`           | Repeatable. One of the actions below.  |
| `relatedProductId` | Only conversions tied to this product. |

```json
[
  {
    "id": "customerId:TICKET_PURCHASE:VIP ticket",
    "action": "TICKET_PURCHASE",
    "name": "VIP ticket"
  }
]
```

## GET /v1/conversions/counts

| Query       | Notes                                                   |
| ----------- | ------------------------------------------------------- |
| `action`    | Repeatable. Omit for every action.                      |
| `startDate` | ISO 8601, inclusive. Default: 28 days before `endDate`. |
| `endDate`   | ISO 8601, inclusive. Default: now.                      |

```json
{
  "startDate": "2026-08-27T00:00:00.000Z",
  "endDate": "2026-08-29T00:00:00.000Z",
  "counts": [
    {
      "action": "RSVP",
      "total": 52,
      "series": [
        { "time": "2026-08-27T07:00:00.000Z", "count": 40 },
        { "time": "2026-08-28T07:00:00.000Z", "count": 12 }
      ]
    }
  ]
}
```

There is one series entry per day, oldest first, including zero days. Days
follow the Pacific calendar. Actions with no events are omitted. Counts are
events, not distinct fans.

## POST /v1/conversions/events

```json
{
  "action": "TICKET_PURCHASE",
  "name": "VIP ticket",
  "timestamp": "2026-08-25T12:30:00-07:00",
  "metadata": {
    "uniqueId": "order_123",
    "currency": "USD",
    "totalPrice": 59.5
  },
  "user": { "email": "fan@example.com", "emailMarketingConsent": true }
}
```

- `metadata.uniqueId` is the idempotency key, and repeats are merged. The
  API also recognizes `productId`, `currency`, `totalPrice`, `totalCost`,
  `city`, `state`, and `country`. With both `city` and `country`, Laylo
  attaches that location to the fan if they don't have one. Other keys are
  passed through but not shown in the Laylo UI.
- `user` needs `email` or `phone` (E.164). Optional flags:
  `emailMarketingConsent`, `smsMarketingConsent`. Extra keys are stored but
  not echoed back; `user.phoneNumber` is rejected, so send `phone`.
- `action` takes any conversion action except `RSVP` (fans subscribing to a
  drop go through `POST /v1/fans/subscriptions`).
- Optional top-level fields: `consentGrantedAt` (ISO 8601), `sessionId`,
  `source`. `source` defaults to the `X-Laylo-Source` header, then to the
  API key's label.

```json
{
  "status": "success",
  "tracked": {
    "action": "TICKET_PURCHASE",
    "name": "VIP ticket",
    "timestamp": "2026-08-25T12:30:00-07:00",
    "metadata": {
      "uniqueId": "order_123",
      "currency": "USD",
      "totalPrice": 59.5
    },
    "user": {
      "emailMarketingConsent": true,
      "hasEmail": true,
      "hasPhone": false
    }
  }
}
```

`status` can be `"failure"` on a 200. Contact details are never echoed back.

## POST /v1/fans/subscribed and POST /v1/fans/unsubscribed

Body: exactly one of `{ "email": "…" }` or `{ "phone": "+12025550100" }`.

```json
{ "isSubscribed": true }
```

```json
{ "isUnsubscribed": false }
```

To check several contacts at once, send either field as an array of 1 to 500,
such as `{ "phone": ["+12025550100", "+12025550101"] }`. The answer is then an
array in request order, `{ "isSubscribed": [true, false] }`, even for a
one-item array; contacts are never echoed back. Any invalid entry rejects the
whole request with a 400 naming its index, such as `phone[3]`, and so does an
empty array or one longer than 500.

`isUnsubscribed` is true only for a contact who subscribed at some point and
has since opted out. Both checks are reads and are safe to retry.

## GET /v1/fans/segments

| Query                   | Notes                                              |
| ----------------------- | -------------------------------------------------- |
| `signUpType`            | **Required.** `sms` or `email`.                    |
| `dropIds`               | Repeatable. Fans who purchased any of these drops. |
| `excludedDropIds`       | Repeatable.                                        |
| `conversionIds`         | Repeatable. Ids from `GET /v1/conversions`.        |
| `excludedConversionIds` | Repeatable.                                        |
| `locations`             | Repeatable, each a JSON object (see below).        |
| `excludedLocations`     | Repeatable, same shape.                            |
| `signedUpAfter`         | ISO 8601, inclusive.                               |
| `signedUpBefore`        | ISO 8601, exclusive.                               |

A location is `{"country":"US"}`, `{"country":"US","state":"CA"}`, or
`{"country":"US","state":"CA","city":"Los Angeles","radius":25}`. Repeated
values match any of them.

- `country` takes an ISO 3166-1 alpha-2 code such as `US` or `FR`.
- `state` takes a state or province code for the US, Canada, and Australia
  (`NY`, `ON`, `NSW`). Elsewhere, use the region's name.
- `city` takes the city's name. Add `radius` to include everywhere within
  that many miles of the city.

```json
{ "numberOfFans": 42 }
```

```sh
# with integrator credentials, add the token mint from SKILL.md and
# -H "Authorization: Bearer $TOKEN"
curl -sS -G https://events.laylo.com/api/v1/fans/segments \
  -H "X-Api-Key: $LAYLO_API_KEY" \
  --data-urlencode "signUpType=sms" \
  --data-urlencode 'locations={"country":"US","state":"CA"}' \
  --data-urlencode "signedUpAfter=2026-01-01T00:00:00Z"
```

## POST /v1/fans/subscriptions

One of:

```json
{ "email": "fan@example.com", "dropId": "drop_123" }
```

```json
{ "phone": "+12025550100" }
```

```json
{ "email": "fan@example.com", "phone": "+12025550100" }
```

With both, each channel is subscribed and the two records are linked as the
same person. Each keeps its own id, returned as `emailFanId` and `phoneFanId`.
If only one subscribes, the other comes back in `rejected` with its `channel`,
`code`, and `message`.

The fan's sign-up time is the time of the call. `consentGrantedAt`,
`emailMarketingConsent`, and `smsMarketingConsent` are deprecated: the API
still accepts them but ignores them, so don't send them.
`dropId` is optional and also RSVPs the fan. An id that isn't one of the
customer's drops returns 404 and writes nothing. Subscribing an existing fan
refreshes their record and clears any earlier unsubscribe.

```json
{
  "subscribed": true,
  "emailFanId": "fan_123",
  "rsvp": { "dropId": "drop_123", "status": "confirmed" }
}
```

`emailFanId` and `phoneFanId` are present for the contacts that subscribed,
`rejected` only on a partial success, and `rsvp` only when `dropId` was sent. Contact details are never returned.

## POST /v1/messages/sms

```json
{ "message": "Presale starts now", "to": ["+12025550100", "+12025550101"] }
```

`to` is one E.164 number or an array of 1 to 200. `message` is up to 1,600
characters, and every recipient gets the same text from the customer's Laylo
number. Only numbers that currently subscribe to the customer are texted.

```json
{ "queued": 1, "skipped": [{ "index": 1, "reason": "not_subscribed" }] }
```

`skipped` identifies recipients by their position in `to` (0 when `to` is a
string), with a reason of `not_subscribed`, `duplicate`, or `queue_failed`.
Messages are billed per SMS segment (160 plain characters, 70 with emoji), and numbers outside +1 bill at the international rate. An invalid number, or one
in a country Laylo doesn't send SMS to, returns 400 and sends nothing. 409
means the customer has no Laylo phone number to send from.

## POST /v1/messages/segments

```json
{
  "message": "Presale starts now: https://laylo.com/example",
  "segment": {
    "signUpType": "sms",
    "dropIds": ["drop_123"],
    "locations": [{ "city": "Los Angeles", "state": "CA", "country": "US" }]
  },
  "timezone": "America/Los_Angeles"
}
```

Messages every fan in `segment` within about five minutes. `segment` takes the
same filters as `GET /v1/fans/segments`, as a JSON object with locations as
plain objects, but only one of `signedUpAfter` and `signedUpBefore` can be
sent, and at most 30 locations and excluded
locations are allowed combined. The segment matches the same fans as the
count. Every drop and conversion id must belong to the customer. `timezone`
is an IANA zone used to read a time the message mentions; only the 57 zones
in the API reference's enum are accepted. Recipients are
worked out when the message sends.

An `sms` segment is texted. An `email` segment is emailed and needs an
`email` object (it's refused on an `sms` segment):

```json
{
  "message": "Presale starts now: https://laylo.com/example",
  "segment": { "signUpType": "email", "dropIds": ["drop_123"] },
  "email": {
    "subject": "The presale is live",
    "ctaUrl": "https://tickets.example.com/presale",
    "ctaText": "Get Tickets"
  },
  "timezone": "America/Los_Angeles"
}
```

`subject` is up to 255 characters. `ctaUrl` (an absolute http or https URL)
and `ctaText` (up to 50 characters) are optional but go together and add the
main button. The email is laid out from `message` like the dashboard's
message composer does it, and its first link becomes a second button unless
it's the same URL.

```json
{
  "dryRun": false,
  "estimate": {
    "channels": {
      "domesticSms": {
        "credits": 1200,
        "creditsPerRecipient": 5,
        "recipients": 240
      },
      "emails": { "credits": 24, "creditsPerRecipient": 2, "recipients": 12 },
      "internationalSms": {
        "credits": 180,
        "creditsPerRecipient": 12,
        "recipients": 15
      }
    },
    "costUsd": 7.02,
    "credits": 1404,
    "disclaimer": "This is an estimate from the fans who match the segment right now. …",
    "recipients": 255,
    "smsSegments": 1
  },
  "id": "4b0d3a8e-6f3c-4c1e-9a55-0f7e2d8c1b2a",
  "note": "Message will start sending at sendAt, within the next few minutes",
  "sendAt": "2026-11-20T19:05:00.000Z"
}
```

`note` and `disclaimer` are for people to read; don't parse them. `sendAt` is
ISO 8601 UTC. `estimate` comes from the fans who match the segment right now;
fans with both a phone number and an email address are counted under
`emails` as well as a text channel, so it errs high, and `costUsd` doesn't subtract free or prepaid credits.

Add `"dryRun": true` to either route to validate the request and get the
estimate without sending: nothing is created, `id` is null, the phishing
screen is skipped, and the `Idempotency-Key` is ignored. A
`503 SERVICE_UNAVAILABLE` means the estimate couldn't be worked out and
nothing was sent; retry with backoff.

## POST /v1/messages/segments/scheduled

The same body plus `sendAt`, the local date and time in `timezone` with no
offset:

```json
{
  "message": "Tickets go on sale tomorrow: https://laylo.com/example",
  "segment": { "signUpType": "sms" },
  "sendAt": "2026-11-20T19:00",
  "timezone": "America/New_York"
}
```

`sendAt` must be 5 minutes to 2 years away and is rounded up to the next
five-minute mark. A time skipped by daylight saving returns 400; a repeated
one uses the first occurrence. The response matches the send-now route.

Both routes take an optional `Idempotency-Key` header (1 to 255 printable
ASCII characters). A repeat with the same key and body within 24 hours
returns the first response, the same key with a different body returns 422,
and a repeat while the first is still running returns 409. Don't resend under
a new key after a 409: the first attempt will probably send. If it never
finishes, the key frees up after a minute and the next request with it sends
again. A message flagged
as possible phishing or scam content returns 403, isn't sent, and locks the
account for review.

## GET /v1/billing/credit-usage

| Query       | Notes                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `startDate` | UTC day as `YYYY-MM-DD`, inclusive. Default: first of `endDate`'s month. |
| `endDate`   | UTC day as `YYYY-MM-DD`, inclusive. Default: today. At most 366 days.    |
| `interval`  | `day` (default), `week`, or `month`.                                     |

```json
{
  "startDate": "2026-09-01",
  "endDate": "2026-09-30",
  "interval": "month",
  "rates": {
    "creditsPerDollar": 200,
    "domesticSms": 5,
    "emails": 2,
    "instagram": 3,
    "internationalSms": 12,
    "mms": 12
  },
  "series": [
    {
      "start": "2026-09-01",
      "channels": {
        "domesticSms": { "count": 100, "credits": 500, "costUsd": 2.5 },
        "emails": { "count": 120, "credits": 240, "costUsd": 1.2 },
        "instagram": { "count": 0, "credits": 0, "costUsd": 0 },
        "internationalSms": { "count": 1, "credits": 12, "costUsd": 0.06 },
        "mms": { "count": 0, "credits": 0, "costUsd": 0 }
      },
      "count": 221,
      "credits": 752,
      "costUsd": 3.76
    }
  ],
  "total": {
    "channels": {
      "domesticSms": { "count": 100, "credits": 500, "costUsd": 2.5 },
      "emails": { "count": 120, "credits": 240, "costUsd": 1.2 },
      "instagram": { "count": 0, "credits": 0, "costUsd": 0 },
      "internationalSms": { "count": 1, "credits": 12, "costUsd": 0.06 },
      "mms": { "count": 0, "credits": 0, "costUsd": 0 }
    },
    "count": 221,
    "credits": 752,
    "costUsd": 3.76
  }
}
```

The series has one bucket for every day, week, or month in the window,
including empty ones. Weeks start on Monday and months on the 1st, except the
first bucket, which starts at `startDate`. `count` is billed units, not
messages: most texts count once per segment. `internationalSms` includes
WhatsApp. Credits are priced at the customer's current `rates`, and `costUsd`
is `credits / creditsPerDollar` rounded to the cent. It's usage, not an
invoice: prepaid and free credits aren't applied.

## GET /v1/billing/credit-usage/products

The same query plus `productId`, repeated for each drop or segment message,
1 to 50: `?productId=drop_123&productId=message_456`. The response is the
report summed across them, plus `productIds`, de-duplicated. A drop includes
its sub-drops. A product the customer doesn't own returns `404 NOT_FOUND`
naming the missing ids; drops that expand to more than 200 products with
their sub-drops return `400 BAD_REQUEST`.

## Conversion actions

`PURCHASE`, `STORE_PURCHASE`, `TICKET_PURCHASE`, `CHECK_IN`, `ADD_TO_CART`,
`LINK_CLICK`, `UPSELL_CLICK`, `UPSELL_REMINDER_CLICK`, `VIP_CLICK`, `RSVP`,
`OPT_OUT`, `DIRECT_MESSAGE`, `CALL`, `FOLLOW`, `SOCIAL_ENGAGEMENT`,
`WAITLIST_SIGNUP`, `SECONDARY_LISTING_CREATED`, `ABANDONED_CART_CLICK`,
`TICKET_SALES_CLICK`, `ABANDONED_CART_CREATED`, `ABANDONED_CART_UPDATED`,
`FORM_SUBMISSION`, `QUESTION_RESPONSE`

## Minimal clients

These send only the API key when `LAYLO_USER_ID` isn't set. With integrator
credentials they cache the token (sharing one mint between concurrent calls
in the JS version) and re-mint once on a 401 that doesn't blame the customer
key. Either way they wait out a 429 using `Retry-After`, and name the
customer by API key or creator id, whichever the environment or the call
provides. Query values that are
`undefined` or `null` are left out, dates are sent as ISO 8601, and location
objects are JSON-encoded.

### JavaScript (fetch)

```js
const BASE = "https://events.laylo.com/api";
// Without integrator credentials, the API key alone authenticates.
const integrator = Boolean(process.env.LAYLO_USER_ID);
let cached;
let minting;

async function mint() {
  const res = await fetch(`${BASE}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: `${process.env.LAYLO_USER_ID}.${process.env.LAYLO_ACCESS_KEY}`,
      client_secret: process.env.LAYLO_SECRET_KEY,
    }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  const skew = Math.min(60, expires_in / 2) * 1000;
  cached = {
    value: access_token,
    refreshAt: Date.now() + expires_in * 1000 - skew,
  };
  return access_token;
}

function token() {
  if (cached && Date.now() < cached.refreshAt)
    return Promise.resolve(cached.value);
  minting ??= mint().finally(() => {
    minting = undefined;
  });
  return minting;
}

function customerHeader({ apiKey, creatorId }) {
  if (apiKey) return { "X-Api-Key": apiKey };
  if (creatorId) return { "X-Creator-Id": creatorId };
  if (process.env.LAYLO_API_KEY)
    return { "X-Api-Key": process.env.LAYLO_API_KEY };
  if (process.env.LAYLO_CREATOR_ID)
    return { "X-Creator-Id": process.env.LAYLO_CREATOR_ID };
  throw new Error(
    "Name the customer: set LAYLO_API_KEY or LAYLO_CREATOR_ID, or pass apiKey or creatorId",
  );
}

function queryValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function laylo(
  method,
  path,
  { query, body, apiKey, creatorId } = {},
) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const item of [].concat(value)) {
      if (item !== undefined && item !== null)
        url.searchParams.append(key, queryValue(item));
    }
  }
  let reminted = false;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        ...(integrator ? { Authorization: `Bearer ${await token()}` } : {}),
        ...customerHeader({ apiKey, creatorId }),
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => undefined);
    if (res.ok) return data;
    if (
      integrator &&
      res.status === 401 &&
      data?.error?.apiKeyStatus !== "invalid" &&
      !reminted
    ) {
      reminted = true;
      cached = undefined;
      continue;
    }
    if (res.status === 429 && attempt < 2) {
      await sleep(
        (Number(res.headers.get("retry-after")) || 2 ** attempt) * 1000,
      );
      continue;
    }
    throw Object.assign(
      new Error(data?.error?.message ?? `HTTP ${res.status}`),
      {
        status: res.status,
        code: data?.error?.code,
        requestId: res.headers.get("apigw-requestid"),
      },
    );
  }
}

// await laylo("GET", "/v1/fans/segments", { query: { signUpType: "sms", locations: [{ country: "US" }] } });
```

### Python (requests)

```python
import json, os, time
from datetime import datetime
import requests

BASE = "https://events.laylo.com/api"
# Without integrator credentials, the API key alone authenticates.
INTEGRATOR = bool(os.environ.get("LAYLO_USER_ID"))
_token = {"value": None, "refresh_at": 0}

def _get_token():
    if _token["value"] and time.time() < _token["refresh_at"]:
        return _token["value"]
    res = requests.post(f"{BASE}/v1/auth/token", json={
        "client_id": f'{os.environ["LAYLO_USER_ID"]}.{os.environ["LAYLO_ACCESS_KEY"]}',
        "client_secret": os.environ["LAYLO_SECRET_KEY"],
    }, timeout=30)
    res.raise_for_status()
    data = res.json()
    skew = min(60, data["expires_in"] / 2)
    _token.update(value=data["access_token"], refresh_at=time.time() + data["expires_in"] - skew)
    return _token["value"]

def _customer_header(api_key=None, creator_id=None):
    if api_key:
        return {"X-Api-Key": api_key}
    if creator_id:
        return {"X-Creator-Id": creator_id}
    if os.environ.get("LAYLO_API_KEY"):
        return {"X-Api-Key": os.environ["LAYLO_API_KEY"]}
    if os.environ.get("LAYLO_CREATOR_ID"):
        return {"X-Creator-Id": os.environ["LAYLO_CREATOR_ID"]}
    raise RuntimeError("Name the customer: set LAYLO_API_KEY or LAYLO_CREATOR_ID, or pass api_key or creator_id")

def _query_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return json.dumps(value)
    return value

def laylo(method, path, query=None, body=None, api_key=None, creator_id=None):
    params = []
    for key, value in (query or {}).items():
        for item in value if isinstance(value, list) else [value]:
            if item is not None:
                params.append((key, _query_value(item)))
    reminted = False
    for attempt in range(3):
        headers = {"Accept": "application/json", **_customer_header(api_key, creator_id)}
        if INTEGRATOR:
            headers["Authorization"] = f"Bearer {_get_token()}"
        res = requests.request(method, BASE + path, params=params, json=body, timeout=30, headers=headers)
        if res.ok:
            return res.json()
        try:
            err = res.json().get("error") or {}
        except ValueError:
            err = {}
        if INTEGRATOR and res.status_code == 401 and err.get("apiKeyStatus") != "invalid" and not reminted:
            reminted = True
            _token["value"] = None
            continue
        if res.status_code == 429 and attempt < 2:
            time.sleep(float(res.headers.get("Retry-After") or 2 ** attempt))
            continue
        raise RuntimeError(f"{res.status_code} {err.get('code')}: {err.get('message')} "
                           f"(request id {res.headers.get('apigw-requestid')})")
    raise RuntimeError("gave up after repeated 401/429 responses")

# laylo("GET", "/v1/drops")
```

A Python `datetime` must carry a timezone (`datetime(2026, 8, 1, tzinfo=timezone.utc)`),
because the API rejects timestamps without an offset.
