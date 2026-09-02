# Contributing

## Setup

Requires Node 20+.

```sh
npm ci
```

## Scripts

| Script                   | What it does                                      |
| ------------------------ | ------------------------------------------------- |
| `npm run lint`           | Lint the source tree with ESLint                  |
| `npm run format`         | Format with Prettier                              |
| `npm run typecheck`      | Typecheck with `tsc --noEmit`                     |
| `npm test`               | Run the unit tests                                |
| `npm run build`          | Build the package with tsup                       |
| `npm run check:package`  | Check the built package with publint and attw     |
| `npm run verify:pack`    | Build, pack, and test the package as it will ship |
| `npm run generate`       | Regenerate types from the OpenAPI spec            |
| `npm run generate:check` | Fail if the generated types are stale             |
| `npm run changeset`      | Record a changelog entry for your PR              |

## Regenerating types

`npm run generate` pulls `https://developers.laylo.com/openapi.json` and
writes the result to `src/generated/openapi.ts`. Don't edit that file by
hand — it's regenerated wholesale. A scheduled workflow runs
`npm run generate:check` on weekdays and fails when the committed output no
longer matches the published spec, so run `npm run generate` and commit the
diff whenever the spec changes.

Friendly, hand-written aliases for the generated types live in
`src/types.ts`. Add one there when a generated name is awkward to use in
application code.

## Adding a resource

Every resource is a class in `src/resources/` extending `APIResource` (`src/resources/base.ts`). Its constructor takes a `ResourceContext` — the shared `HttpClient`, `TokenProvider`, and the client's default customer API key — and each public method accepts its endpoint's parameters followed by a trailing `RequestOptions`, delegating to the protected `request<T>(endpoint, options)`, which resolves the customer key (per-request `apiKey` wins over the context's), attaches the bearer token, and returns the parsed body. Give every method JSDoc with a description, `@returns`, an `@example`, and an `@see` link to its `https://developers.laylo.com/api-reference/<tag>/<operationId>` page; nest sub-surfaces as their own classes (`messages.scheduled`) so siblings can join them later without renames; and add a colocated test in `src/resources/__tests__/` that uses the fake-fetch harness to assert the exact method, URL, and auth headers, plus `expectTypeOf` on the return type.

## Verifying the package

`npm run verify:pack` builds the SDK, packs it exactly as `npm publish` would,
installs that tarball into `examples/`, and runs the ESM, CommonJS, and
TypeScript consumers against it — the last two typechecked under both `node16`
and `bundler` module resolution against our shipped declarations. It also
typechecks every `ts` code snippet in the README, so a snippet that no longer
compiles fails this check too. Everything else in CI tests the source tree;
this is the only check that someone doing `npm install @laylo.com/node` gets
a package whose exports map, dual builds, and `.d.ts` files actually resolve.
Run it before publishing, and whenever you touch `package.json`,
`tsup.config.ts`, or the shape of the public exports.

## Comments

Don't write comments that restate what the code already says. A comment
earns its place only when it captures something the code can't show on its
own — a non-obvious rule, an external API quirk, or the reason a workaround
exists. The one exception is JSDoc on public symbols: every exported class,
method, and type gets it, regardless of how self-explanatory the signature
seems.

## Changesets

Run `npx changeset` on any PR that touches `src/`. Pick the version bump
(patch for fixes, minor for new resources or methods, major for breaking
changes) and write the summary the way you'd want to read it in the
changelog — describe the change from the caller's perspective, not the
implementation. CI fails a PR that touches `src/` without a changeset.

Releases happen from the "Version Packages" pull request: merging changesets
into `main` opens or updates that PR, and merging it publishes the new
version to npm.
