# Contributing

## Adding a resource

Every resource is a class in `src/resources/` extending `APIResource` (`src/resources/base.ts`). Its constructor takes a `ResourceContext` — the shared `HttpClient`, `TokenProvider`, and the client's default customer API key — and each public method accepts its endpoint's parameters followed by a trailing `RequestOptions`, delegating to the protected `request<T>(endpoint, options)`, which resolves the customer key (per-request `apiKey` wins over the context's), attaches the bearer token, and returns the parsed body. Give every method JSDoc with a description, `@returns`, an `@example`, and an `@see` link to its `https://developers.laylo.com/api-reference/<tag>/<operationId>` page; nest sub-surfaces as their own classes (`messages.scheduled`) so siblings can join them later without renames; and add a colocated test in `src/resources/__tests__/` that uses the fake-fetch harness to assert the exact method, URL, and auth headers, plus `expectTypeOf` on the return type.

## Verifying the package

`npm run verify:pack` builds the SDK, packs it exactly as `npm publish` would,
installs that tarball into `examples/`, and runs the ESM, CommonJS, and
TypeScript consumers against it — the last two typechecked under both `node16`
and `bundler` module resolution against our shipped declarations. Everything
else in CI tests the source tree; this is the only check that someone doing
`npm install @laylo/node` gets a package whose exports map, dual builds, and
`.d.ts` files actually resolve. Run it before publishing, and whenever you
touch `package.json`, `tsup.config.ts`, or the shape of the public exports.
