import Laylo, { LayloAPIError, RateLimitError } from "@laylo.com/node";

const laylo = new Laylo({
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
  apiKey: process.env.LAYLO_API_KEY,
});

try {
  await laylo.drops.list();
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`retry after ${String(error.retryAfter)}s`);
  } else if (error instanceof LayloAPIError) {
    console.error(error.status, error.code, error.message);
  } else {
    throw error;
  }
}
