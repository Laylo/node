import { createServer } from "node:http";

const ACCESS_TOKEN = "fake-access-token";

const VERIFIED = {
  apiKeyStatus: "valid",
  message: "API key verified successfully",
};

const send = (response, status, payload) => {
  const json = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  response.end(json);
};

const notFound = (response, message) => {
  send(response, 404, { error: { code: "NOT_FOUND", message } });
};

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const mintToken = async (request, response) => {
  const credentials = await readJson(request);
  if (!credentials.client_id || !credentials.client_secret) {
    send(response, 400, {
      error: {
        code: "BAD_REQUEST",
        message: "client_id and client_secret are required",
      },
    });
    return;
  }
  send(response, 200, {
    access_token: ACCESS_TOKEN,
    token_type: "Bearer",
    expires_in: 3600,
  });
};

const verifyKey = (request, response) => {
  if (request.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
    send(response, 401, {
      error: { code: "UNAUTHENTICATED", message: "Missing or stale bearer" },
    });
    return;
  }
  if (!request.headers["x-api-key"]) {
    send(response, 401, {
      error: {
        code: "UNAUTHENTICATED",
        apiKeyStatus: "invalid",
        message: "Missing X-Api-Key",
      },
    });
    return;
  }
  send(response, 200, VERIFIED);
};

export const startFakeServer = () =>
  new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const { pathname } = new URL(request.url, "http://localhost");
      if (request.method === "POST" && pathname === "/api/v1/auth/token") {
        mintToken(request, response).catch(() => {
          send(response, 400, {
            error: { code: "BAD_REQUEST", message: "Malformed token request" },
          });
        });
        return;
      }
      if (request.method === "GET" && pathname === "/api/v1/keys/verify") {
        verifyKey(request, response);
        return;
      }
      notFound(response, `No route for ${request.method} ${pathname}`);
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}/api`,
        close: () =>
          new Promise((closed) => {
            server.close(() => closed());
          }),
      });
    });
  });
