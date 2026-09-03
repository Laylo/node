  import Laylo from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
    apiKey: process.env.LAYLO_API_KEY,
  });

  // SMS fans who purchased drop A but not drop B
  const numberOfFans = await laylo.fans.segments.count({
    signUpType: "sms",
    dropIds: ["drop_A"],
    excludedDropIds: ["drop_B"],
  });
