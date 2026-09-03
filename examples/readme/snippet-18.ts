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
