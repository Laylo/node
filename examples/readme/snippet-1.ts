import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
  apiKey: process.env.LAYLO_API_KEY,
});

await laylo.keys.verify();

const drops = await laylo.drops.list();
console.log(drops.map((drop) => drop.title));
