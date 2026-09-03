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
