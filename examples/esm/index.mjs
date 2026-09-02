import assert from "node:assert/strict";
import Laylo, { Laylo as NamedLaylo, VERSION } from "@laylo.com/node";
import { createDryRunFetch } from "../dry-run-fetch.mjs";
import { startFakeServer } from "../fake-server.mjs";

assert.equal(
  NamedLaylo,
  Laylo,
  "the named export and the default export must be the same class",
);

const CREDENTIALS = {
  clientId: process.env.LAYLO_CLIENT_ID ?? "example-user.example-access-key",
  clientSecret: process.env.LAYLO_CLIENT_SECRET ?? "example-client-secret",
  apiKey: process.env.LAYLO_API_KEY ?? "example-customer-api-key",
};

const confirm = (verified) => {
  assert.equal(verified.apiKeyStatus, "valid");
  console.log(
    `esm example ok — @laylo.com/node ${VERSION}: ${verified.message}`,
  );
};

if (process.argv.includes("--dry-run")) {
  const laylo = new Laylo({ ...CREDENTIALS, fetch: createDryRunFetch() });
  confirm(await laylo.keys.verify());
} else {
  const server = await startFakeServer();
  try {
    const laylo = new Laylo({ ...CREDENTIALS, baseUrl: server.baseUrl });
    confirm(await laylo.keys.verify());
    confirm(await laylo.forCustomer("another-customer-api-key").keys.verify());
  } finally {
    await server.close();
  }
}
