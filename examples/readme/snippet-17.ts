import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
  apiKey: process.env.LAYLO_API_KEY,
  maxRetries: 5,
  timeoutMs: 10_000,
});

const controller = new AbortController();
await laylo.drops.list({
  timeoutMs: 5_000,
  retry: false,
  signal: controller.signal,
});
