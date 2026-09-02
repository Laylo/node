const assert = require("node:assert/strict");
const { Laylo, VERSION } = require("@laylo.com/node");

assert.equal(
  require("@laylo.com/node"),
  Laylo,
  "requiring the package must give back the Laylo class itself",
);

const CREDENTIALS = {
  clientId: process.env.LAYLO_CLIENT_ID ?? "example-user.example-access-key",
  clientSecret: process.env.LAYLO_CLIENT_SECRET ?? "example-client-secret",
  apiKey: process.env.LAYLO_API_KEY ?? "example-customer-api-key",
};

const confirm = (verified) => {
  assert.equal(verified.apiKeyStatus, "valid");
  console.log(
    `cjs example ok — @laylo.com/node ${VERSION}: ${verified.message}`,
  );
};

const main = async () => {
  if (process.argv.includes("--dry-run")) {
    const { createDryRunFetch } = await import("../dry-run-fetch.mjs");
    const laylo = new Laylo({ ...CREDENTIALS, fetch: createDryRunFetch() });
    confirm(await laylo.keys.verify());
    return;
  }

  const { startFakeServer } = await import("../fake-server.mjs");
  const server = await startFakeServer();
  try {
    const laylo = new Laylo({ ...CREDENTIALS, baseUrl: server.baseUrl });
    confirm(await laylo.keys.verify());
    confirm(await laylo.forCustomer("another-customer-api-key").keys.verify());
  } finally {
    await server.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
