  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const vipTicket = await laylo.conversions.definitions.create({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
    relatedProductId: "drop_123",
  });
