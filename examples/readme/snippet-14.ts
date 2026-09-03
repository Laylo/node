  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  const scheduled = await laylo.messages.scheduled.list();
  for (const drop of scheduled) {
    console.log(
      drop.title,
      drop.endDate === null ? null : new Date(drop.endDate),
    );
  }
