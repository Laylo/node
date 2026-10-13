---
"@laylo.com/node": minor
---

New `laylo.billing.creditUsage` resource for the public API's credit usage endpoints. `get(params?)` returns the message credits a customer used over a window of UTC days, per channel, with a series bucketed by day, week, or month. `getForProducts({ productIds, ...params })` returns the same report summed across specific drops and segment messages. `startDate` and `endDate` are UTC days as `YYYY-MM-DD` strings. New types: `CreditUsageReport`, `CreditUsageByProductReport`, `CreditUsage`, `CreditUsageBucket`, `ChannelCreditUsage`, `CreditChannel`, `CreditRates`, `CreditUsageInterval`, `GetCreditUsageParams`, `GetProductCreditUsageParams`, and `GetProductCreditUsageInput`.
