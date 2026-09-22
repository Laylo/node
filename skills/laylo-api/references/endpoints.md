# Endpoint reference

Base URL: `https://events.laylo.com/api`. All responses are JSON. Every
endpoint except `POST /v1/auth/token` needs `Authorization: Bearer <token>`
plus exactly one of `X-Api-Key` or `X-Creator-Id`.

## POST /v1/auth/token

Body (JSON or `application/x-www-form-urlencoded`):

```json
{ "client_id": "…", "client_secret": "…" }
```

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
`X-Creator-Id`. A bad key returns 401 with `error.apiKeyStatus: "invalid"`.
A key on an account without a paid plan returns 403.

## GET /v1/customers

The accounts under the integration's own Laylo account, sorted by display
name. Scoped to the integration, but a customer header is still required.

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
  API also recognizes `productId`, `currency`, `totalPrice`, and `totalCost`.
  Other keys are passed through.
- `user` needs one of `email`, `phone` (E.164), or a non-anonymous
  `fingerprintId`. Optional flags: `emailMarketingConsent`,
  `smsMarketingConsent`, `isAnonymous`.
- Optional top-level fields: `consentGrantedAt` (ISO 8601), `sessionId`,
  `source`.

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

```json
{ "numberOfFans": 42 }
```

```sh
curl -sS -G https://events.laylo.com/api/v1/fans/segments \
  -H "Authorization: Bearer $TOKEN" -H "X-Api-Key: $LAYLO_API_KEY" \
  --data-urlencode "signUpType=sms" \
  --data-urlencode 'locations={"country":"US","state":"CA"}' \
  --data-urlencode "signedUpAfter=2026-01-01T00:00:00Z"
```

## POST /v1/fans/subscriptions

One of:

```json
{
  "email": "fan@example.com",
  "emailMarketingConsent": true,
  "consentGrantedAt": "2026-08-25T12:30:00-07:00",
  "dropId": "drop_123"
}
```

```json
{
  "phone": "+12025550100",
  "smsMarketingConsent": true,
  "consentGrantedAt": "2026-08-25T12:30:00-07:00"
}
```

`consentGrantedAt` becomes the sign-up time and can't be in the future.
`dropId` is optional and also RSVPs the fan. An id that isn't one of the
customer's drops returns 404 and writes nothing. Subscribing an existing fan
refreshes their record and clears any earlier unsubscribe.

```json
{
  "subscribed": true,
  "fan": { "id": "fan_123" },
  "rsvp": { "dropId": "drop_123", "status": "confirmed" }
}
```

`rsvp` is present only when `dropId` was sent. `fan` may also carry
`inferredDisplayName`, `joinedAt`, and `location` (`city`, `state`,
`country`). Contact details are never returned.

## Conversion actions

`PURCHASE`, `STORE_PURCHASE`, `TICKET_PURCHASE`, `CHECK_IN`, `ADD_TO_CART`,
`LINK_CLICK`, `UPSELL_CLICK`, `UPSELL_REMINDER_CLICK`, `VIP_CLICK`, `RSVP`,
`OPT_OUT`, `DIRECT_MESSAGE`, `CALL`, `FOLLOW`, `SOCIAL_ENGAGEMENT`,
`WAITLIST_SIGNUP`, `SECONDARY_LISTING_CREATED`, `ABANDONED_CART_CLICK`,
`TICKET_SALES_CLICK`, `ABANDONED_CART_CREATED`, `ABANDONED_CART_UPDATED`,
`FORM_SUBMISSION`, `QUESTION_RESPONSE`

## Minimal clients

These cache the token, re-mint once on a 401 that doesn't blame the customer
key, and name the customer by API key.

### JavaScript (fetch)

```js
const BASE = "https://events.laylo.com/api";
let cached;

async function token() {
  if (cached && Date.now() < cached.refreshAt) return cached.value;
  const res = await fetch(`${BASE}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.LAYLO_CLIENT_ID,
      client_secret: process.env.LAYLO_CLIENT_SECRET,
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

export async function laylo(
  method,
  path,
  { query, body, apiKey = process.env.LAYLO_API_KEY } = {},
) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const item of [].concat(value)) {
      url.searchParams.append(
        key,
        typeof item === "object" ? JSON.stringify(item) : String(item),
      );
    }
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        "X-Api-Key": apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => undefined);
    if (res.ok) return data;
    if (
      res.status === 401 &&
      data?.error?.apiKeyStatus !== "invalid" &&
      attempt === 0
    ) {
      cached = undefined;
      continue;
    }
    throw Object.assign(
      new Error(data?.error?.message ?? `HTTP ${res.status}`),
      {
        status: res.status,
        code: data?.error?.code,
      },
    );
  }
}

// await laylo("GET", "/v1/fans/segments", { query: { signUpType: "sms", locations: [{ country: "US" }] } });
```

### Python (requests)

```python
import json, os, time
import requests

BASE = "https://events.laylo.com/api"
_token = {"value": None, "refresh_at": 0}

def _get_token():
    if _token["value"] and time.time() < _token["refresh_at"]:
        return _token["value"]
    res = requests.post(f"{BASE}/v1/auth/token", json={
        "client_id": os.environ["LAYLO_CLIENT_ID"],
        "client_secret": os.environ["LAYLO_CLIENT_SECRET"],
    }, timeout=30)
    res.raise_for_status()
    data = res.json()
    skew = min(60, data["expires_in"] / 2)
    _token.update(value=data["access_token"], refresh_at=time.time() + data["expires_in"] - skew)
    return _token["value"]

def laylo(method, path, query=None, body=None, api_key=None):
    params = []
    for key, value in (query or {}).items():
        for item in value if isinstance(value, list) else [value]:
            params.append((key, json.dumps(item) if isinstance(item, dict) else item))
    for attempt in range(2):
        res = requests.request(method, BASE + path, params=params, json=body, timeout=30, headers={
            "Authorization": f"Bearer {_get_token()}",
            "X-Api-Key": api_key or os.environ["LAYLO_API_KEY"],
            "Accept": "application/json",
        })
        if res.ok:
            return res.json()
        try:
            err = res.json().get("error") or {}
        except ValueError:
            err = {}
        if res.status_code == 401 and err.get("apiKeyStatus") != "invalid" and attempt == 0:
            _token["value"] = None
            continue
        raise RuntimeError(f"{res.status_code} {err.get('code')}: {err.get('message')}")

# laylo("GET", "/v1/drops")
```
