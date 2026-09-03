  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const events = await laylo.conversions.events.list({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
    limit: 100,
  });
  for await (const { fan, event } of events) {
    console.log(fan.id, event.count, new Date(event.createdAt));
  }
