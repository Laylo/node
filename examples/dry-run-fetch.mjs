const REDACTED = new Set(["authorization", "x-api-key"]);

const CANNED = {
  "/api/v1/auth/token": {
    access_token: "dry-run-access-token",
    token_type: "Bearer",
    expires_in: 3600,
  },
  "/api/v1/keys/verify": {
    apiKeyStatus: "valid",
    message: "API key verified successfully",
  },
};

const describeHeaders = (headers) =>
  [...new Headers(headers)]
    .map(
      ([name, value]) =>
        `${name}: ${REDACTED.has(name) ? "[redacted]" : value}`,
    )
    .join(", ");

export const createDryRunFetch = () => (url, init) => {
  const { pathname } = new URL(url);
  console.log(`${init.method} ${url} [${describeHeaders(init.headers)}]`);
  const payload = CANNED[pathname];
  if (payload === undefined) {
    throw new Error(`No canned response for ${init.method} ${pathname}`);
  }
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
};
