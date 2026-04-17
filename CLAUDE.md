# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP server providing read/write access to Copilot Money personal finance data.

- **Reads** come from the local Firestore cache that the Copilot Money Mac app maintains on disk (LevelDB + protobuf). No auth, no network.
- **Writes** go to Copilot's private GraphQL endpoint with a bearer token stored in the macOS Keychain.

Two binaries: `copilot-money-mcp` (MCP server over stdio) and `copilot-auth` (CLI for magic-link login).

## Commands

```bash
npm run build       # Compile TypeScript (tsc)
npm run dev         # Watch mode (tsc --watch)
npm test            # Compile tests + run with node:test
npm run lint        # ESLint
npm run typecheck   # Type checking only (tsc --noEmit)
```

Run a single test file:
```bash
tsc --project tsconfig.test.json && node --test dist/tests/tools/transactions.test.js
```

## Quality Gates (MANDATORY)

Before ANY commit, ALL must pass:
1. `npm run build`
2. `npm run lint`
3. `npm test`
4. `/review-code` must return grade A (126+/140)

## Architecture

### Entry Points
- `src/server.ts` — MCP server. Creates `LocalStore` + `AuthManager` + `GraphQLClient`, registers tools, connects via `StdioServerTransport`. If the local cache is absent at startup, read tools fail with `LOCAL_CACHE_MISSING` but write tools still work.
- `src/cli.ts` — Auth CLI (`copilot-auth login|logout|status`). Magic-link-paste flow. No daemon, no browser.

### Auth (keychain-only)
- `auth/keychain.ts` — Stores `{ token, refreshToken, email, expiresAt }` in macOS Keychain via `keytar`. Service: `copilot-money-auth`, account: `token`.
- `auth/manager.ts` — Thin facade. `getToken()` returns the ID token if still valid (60-second expiry buffer); otherwise throws `TOKEN_EXPIRED` or `NOT_AUTHENTICATED`. No caching, no refresh.
- `auth/firebaseRest.ts` — Direct REST calls to `identitytoolkit.googleapis.com`: `sendOobCode` (emails a sign-in link) and `signInWithEmailLink` (exchanges the `oobCode` for an ID token). `parseOobCodeFromUrl` extracts the code from the pasted sign-in URL.

### LocalStore (read backend)
- `localstore/path.ts` — Resolves `~/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main`. Throws `LOCAL_CACHE_MISSING` if absent.
- `localstore/leveldb.ts` — Read-only iterator over Copilot's Firestore LevelDB cache.
- `localstore/keypath.ts` — Parses Firestore document key paths (collection/doc ID extraction).
- `localstore/protobuf.ts` — Decodes Firestore `Document` protos into JSON.
- `localstore/decoders/*.ts` — Per-entity mappers from raw Firestore docs to our Zod-validated types (accounts, categories, tags, transactions, recurring, budgets).
- `localstore/index.ts` — `LocalStore` facade. Exposes `getAccounts`, `getCategories`, `getTags`, `getTransactions`, `getRecurring`, `getBudgets`, `getCacheStatus`, `close`.

### GraphQL Layer (write backend)
- `graphql/client.ts` — `mutate<T>()` targets `https://app.copilot.money/api/graphql` with `Authorization: Bearer <idToken>`. On 401/403, surfaces `TOKEN_EXPIRED` so the tool can point the user at `copilot-auth login`.
- `graphql/fragments.ts` — Shared field fragments.
- `graphql/mutations.ts` — Write operations (`EDIT_TRANSACTION_MUTATION`, `BULK_EDIT_TRANSACTIONS_MUTATION`, etc.).

No `queries.ts` — reads are served by `LocalStore`, not GraphQL.

### Tool Registration
All tools registered in `tools/index.ts` via `registerTools()`. Each tool file exports a handler function. Pattern:
- Zod schema defines input validation.
- Handler receives validated input + `GraphQLClient` + `LocalStore`.
- Read handlers call `LocalStore` methods and include `meta.cacheUpdatedAt` in the response.
- Write handlers call `GraphQLClient.mutate()`; on `TOKEN_EXPIRED` they return a clean error pointing at `copilot-auth login`.
- `get_cache_status` is a diagnostic tool that returns the cache path, per-entity counts, and `lastUpdatedAt` timestamps.
- Returns via `formatResult()` / `formatError()` helpers.

### Error System
`types/error.ts` — `CopilotMoneyError` with typed `ErrorCode` enum. Key codes:
- `NOT_AUTHENTICATED` / `TOKEN_EXPIRED` — point the user at `copilot-auth login`.
- `LOCAL_CACHE_MISSING` — Mac app not installed or never opened.
- `LOCAL_CACHE_LOCKED` — Mac app is holding the LevelDB write lock; close the app and retry.
- Category/tag validation errors carry a `suggestions` field listing valid names.
- `toMcpError()` converts to MCP-compatible response format.

### Testing Patterns
- Node.js built-in `node:test` — no external framework.
- Factory functions (`createKeychain()`, `createAuthManager()`, `createLocalStore()`) accept injected dependencies for testability.
- Mock pattern: create mock `LocalStore` or mock `KeychainPort` → pass to the subject → assert calls.
- LevelDB fixture tests copy a canned LevelDB directory to a tempdir before opening, so tests never touch the user's real cache.
- Test fixtures in `tests/fixtures/` (`leveldb-sample`, `protobuf-samples`, `transactions.json`). Builders at `tests/fixtures/build-firestore-doc.ts` and `build-leveldb-fixture.ts`.
- Tests compile via separate `tsconfig.test.json` (includes both `src/` and `tests/`).

## Key Constraints
- **Reads require the Copilot Money Mac app** installed and opened at least once — that's what populates the on-disk Firestore cache. If the app has never run, reads fail with `LOCAL_CACHE_MISSING`.
- Writes need a valid ID token. Tokens expire ~60 minutes after login; on expiry, write tools return `TOKEN_EXPIRED` and the user re-runs `copilot-auth login`.
- No daemon. No background refresh. Login is fully manual.
- No Playwright. No password storage. Copilot removed password login; magic-link is the only option.
- `keytar` requires native compilation (libsecret on Linux, though this server targets macOS).
- No official public API — writes hit the same GraphQL endpoint the Copilot Money web app uses.
- Transaction reads are bounded by what's in the local cache (which mirrors what the Mac app has synced).
