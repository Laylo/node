  import Laylo, { AuthenticationError } from "@laylo.com/node";

  const laylo = new Laylo({
    clientId: process.env.LAYLO_CLIENT_ID,
    clientSecret: process.env.LAYLO_CLIENT_SECRET,
  });

  try {
    await laylo.keys.verify({ apiKey: "untrusted-key" });
  } catch (error) {
    if (
      error instanceof AuthenticationError &&
      error.apiKeyStatus === "invalid"
    ) {
      console.log("reject the key");
    } else {
      throw error;
    }
  }
