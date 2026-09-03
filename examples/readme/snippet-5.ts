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
