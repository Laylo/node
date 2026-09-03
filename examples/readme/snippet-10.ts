  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const { status, tracked } = await laylo.conversions.events.track({
    action: "TICKET_PURCHASE",
    name: "VIP ticket",
    timestamp: new Date(),
    metadata: { uniqueId: "order_123", currency: "USD", totalPrice: 59.5 },
    user: { email: "fan@example.com", emailMarketingConsent: true },
  });
  if (status === "failure") {
    console.log("queue for retry", tracked);
  }
