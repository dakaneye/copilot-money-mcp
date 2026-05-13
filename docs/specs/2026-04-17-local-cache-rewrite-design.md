# Local Cache + Magic-Link Rewrite

> Design spec for replacing Playwright password automation with local Firestore reads and on-demand Firebase REST magic-link login.

## Problem Statement

The current architecture is structurally broken:

1. **Copilot removed password login.** Help docs: *"We have temporarily restricted the option to sign in using a traditional password."* Apple Sign-In and email magic link are the only options. Our `automatedLogin()` replays a stored password, so daemon token refresh cannot succeed.
2. **The daemon's value proposition is gone.** Its sole purpose was replaying a password to keep the ID token fresh. Without that, it burns Playwright retries that trip App Check throttling (reCAPTCHA 403 → Firebase throttles auth for ~24h).
3. **Token expiry affects reads and writes equally.** Firebase ID tokens expire at ~60 min; both read and write tool calls attach `Authorization: Bearer <id_token>` to the GraphQL endpoint. Auto-refresh isn't possible without breaking Copilot's terms or fighting App Check.
4. **The user actually runs the Copilot Money Mac app sometimes.** That populates a local Firestore cache that never expires on its own and doesn't require auth to read.

## Constraints

- **No official API.** GraphQL at `app.copilot.money/api/graphql` is the only write surface.
- **App Check on Firebase Auth endpoints.** Empirically enforced in the browser; unknown whether it's enforced on direct REST calls to `identitytoolkit.googleapis.com`. Must test.
- **Firebase ID token ~60 min expiry.** No way to extend.
- **Reference implementation exists.** `ignaciohermosillacornejo/copilot-money-mcp` (MIT) is a read-only MCP that parses the same LevelDB cache. Its library choices and protobuf approach are fair to learn from.
- **Personal-first, do not actively break npm users.** Project is published as `@dakaneye-js/copilot-money-mcp`. Magic-link-paste works for anyone; no `op://` or 1Password-specific assumptions.

## Non-Goals

- Automatic token refresh (no daemon, no background process).
- Silent fallback from local cache to GraphQL. Every failure mode is surfaced.
- 2FA enrollment flows. If the user has Copilot's authenticator 2FA enabled (added March 2026), login completes a second REST hop; beyond that, we stay out of MFA management.
- Firebase refresh-token exchange via `securetoken.googleapis.com`. Captured and stored for a future experiment; not used in this design.

## Design

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  MCP Server (stdio)                                            │
├────────────────────────────────────────────────────────────────┤
│  Read tools  ──► LocalStore  ──► LevelDB (read-only)           │
│                                  └─► protobuf decoders          │
│                                                                  │
│  Write tools ──► AuthManager ──► keychain (jwt, refresh, email)│
│                └─► GraphQLClient ──► app.copilot.money/graphql │
│                                       Authorization: Bearer    │
└────────────────────────────────────────────────────────────────┘
        ▲                                    ▲
        │                                    │ token expired?
        │                                    │    → TOKEN_EXPIRED
        │ cache populated by opening         │      error to Claude
        │ the Copilot Money Mac app          │
        │                                    │
 ~/Library/Containers/com.copilot.production/Data/Library/
 Application Support/firestore/__FIRAPP_DEFAULT/
 copilot-production-22904/main/
                                                 ▲
                                                 │
                              copilot-auth login (manual)
                              ├── prompt email
                              ├── POST accounts:sendOobCode
                              ├── user pastes magic-link URL
                              ├── parse oobCode
                              ├── POST accounts:signInWithEmailLink
                              └── keychain.setToken({ idToken, refreshToken, email, expiresAt })
```

Two backends, each does one thing. No daemon. No socket. No Playwright.

### Components

**New modules:**

- `src/localstore/path.ts` — resolves the Firestore cache directory; returns `LOCAL_CACHE_MISSING` when absent.
- `src/localstore/leveldb.ts` — opens LevelDB read-only; iterates key ranges; surfaces `LOCAL_CACHE_LOCKED` if the Electron app holds an exclusive lock. Library choice (`classic-level` vs. `level` vs. `leveldown`) decided during research, informed by the reference MCP.
- `src/localstore/protobuf.ts` — decodes Firestore `Document` / `Value` protobuf messages into JS objects. Reuses schemas from a published package rather than hand-rolling `.proto`.
- `src/localstore/decoders/` — per-entity decoders: `transactions.ts`, `accounts.ts`, `categories.ts`, `tags.ts`, `recurring.ts`, `budgets.ts`, and later `goals.ts`, `holdings.ts`, etc. Each maps raw Firestore docs to the existing Zod shapes in `src/types/`.
- `src/localstore/index.ts` — aggregates decoders behind a single `LocalStore` class the tool handlers call.
- `src/auth/firebaseRest.ts` — minimal REST client: `sendOobCode({ email, continueUrl })`, `signInWithEmailLink({ email, oobCode })`, `parseOobCodeFromUrl(pastedUrl)`. Uses global `fetch`. Hard-codes Copilot's public Firebase web API key.

**Changed modules:**

- `src/tools/*.ts` (read tools) — swap `GraphQLClient` for `LocalStore`. Handler signature unchanged.
- `src/tools/*.ts` (write tools) — unchanged internally; expired-token error path returns a clearer `TOKEN_EXPIRED` message pointing at `copilot-auth login`.
- `src/auth/manager.ts` — shrinks to a keychain wrapper: `getToken()`, `setToken()`, `clear()`. Removes daemon fallback, 30-second cache, token-refresh callback. Adds migration that clears any stored password on first run.
- `src/cli.ts` — `login` rewrites to magic-link-paste. Remove `daemon` subcommand. Keep `status`, `logout`.
- `src/server.ts` — drop daemon wiring; instantiate `LocalStore`, `AuthManager`, `GraphQLClient`.

**Deleted:**

- `src/auth/daemon.ts`
- `src/auth/socket.ts`
- `src/auth/playwright.ts`
- `playwright` entry in `optionalDependencies`
- `bin/copilot-auth` entries related to `daemon` subcommand
- 5-minute tag/category TTL cache in `src/tools/index.ts` (local reads are cheap)
- Any `passwordLogin` / `automatedLogin` / socket code paths in tests

### Data flow

**Read (happy path):**
```
Claude → tool(get_transactions, filter)
  → LocalStore.getTransactions(filter)
    → LevelDB.iter(keyPrefix: "transactions/")
    → decode each → Transaction[]
    → in-memory filter (date, category, tag)
  ← Transaction[]
← formatResult(entities, meta: { entityType, cacheUpdatedAt })
```

**Read (cache missing):**
```
LocalStore.open()
  → ENOENT on cache directory
  ← CopilotMoneyError({
      code: LOCAL_CACHE_MISSING,
      message: "Copilot Money not installed or never opened.
                Install it from the App Store and open it once, then retry."
    })
```

**Write (happy path):**
```
Claude → tool(categorize_transaction, { id, categoryId })
  → AuthManager.getToken()  → keychain hit, JWT valid
  → GraphQLClient.mutate(EDIT_TRANSACTION_MUTATION, vars)
  ← { transaction: {...} }
← formatResult({ updated: true })
```

**Write (token expired):**
```
Claude → tool(categorize_transaction, ...)
  → AuthManager.getToken()  → exp < now + 60s buffer
  ← CopilotMoneyError({
      code: TOKEN_EXPIRED,
      message: "Authentication expired. Run `copilot-auth login` in your terminal, then retry."
    })
```

**Login (`copilot-auth login`):**
```
prompt: email?
→ POST https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=<WEB_API_KEY>
   { requestType: "EMAIL_SIGNIN", email, continueUrl }
← 200 ok
print: "Check your email and paste the sign-in URL here:"
prompt: paste URL → parse `oobCode` query param
→ POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=<WEB_API_KEY>
   { email, oobCode }
← { idToken, refreshToken, localId, expiresIn }
parse JWT exp → keychain.setToken({ token: idToken, refreshToken, email, expiresAt })
print: "Logged in as <email>. Token valid ~60 min."
```

### Error taxonomy (additions to `types/error.ts`)

| Code | When | Message |
|------|------|---------|
| `LOCAL_CACHE_MISSING` | Cache dir absent | "Copilot Money not installed or never opened. Install and open it once." |
| `LOCAL_CACHE_LOCKED` | LevelDB exclusive lock held | "Copilot Money is open and holding an exclusive lock. Close the app or retry." |
| `ENTITY_NOT_CACHED` | Requested id/range not in cache | "Entity `<id>` not in local cache. Open the app and scroll to the relevant period." |
| `TOKEN_EXPIRED` | JWT past expiry buffer | "Authentication expired. Run `copilot-auth login` then retry." |
| `TOKEN_MISSING` | No token in keychain | "Not logged in. Run `copilot-auth login`." |
| `OOB_CODE_INVALID` | Firebase rejects oobCode | "Sign-in link invalid or expired. Run `copilot-auth login` again." |
| `SEND_OOB_CODE_FAILED` | `sendOobCode` non-2xx | "Copilot rejected the sign-in request. If this persists you may be App-Check-throttled; wait 24h." |

`ENTITY_NOT_CACHED` reuses the existing `suggestions` field to surface the cached date range.

### Cache staleness

- New read tool `get_cache_status` returns `{ cacheLocation, entities: { transactions: { count, lastUpdatedAt }, accounts: {...}, ... }, totalSizeBytes }`.
- Every read tool response includes `meta: { entityType, cacheUpdatedAt }` so Claude can reason about freshness without a second call.
- No silent fallback to GraphQL for reads. Stale or missing data surfaces errors loudly so users know to open the app.

### Tool surface

**Phase 1 — parity + observability (7 read tools + 9 write tools):**
- Read: `get_transactions`, `get_accounts`, `get_categories`, `get_tags`, `get_recurring`, `get_budgets`, `get_cache_status`
- Write: `categorize_transaction`, `review_transaction`, `unreview_transaction`, `tag_transaction`, `untag_transaction`, `bulk_categorize`, `bulk_review`, `bulk_tag`, `suggest_categories`

`get_cache_status` ships in Phase 1 because the per-tool `meta.cacheUpdatedAt` field and the staleness error messages depend on its underlying logic.

**Phase 2 — coverage growth (10 new read tools):**
- `get_goals`, `get_goal_history`, `get_balance_history`, `get_holdings`, `get_investment_prices`, `get_stock_splits`, `get_investment_performance`, `get_time_weighted_returns`, `get_securities`, `get_connection_status`

## Quality gates

Every commit — feature commits, refactor commits, test commits — must pass:

1. `npm run build`
2. `npm run lint`
3. `npm test`
4. `/review-code` grade A (126+/140) on the changes introduced.

Implementation phases are sized so each phase ends in a green, grade-A state. No "fix in the next commit" allowed for code that ships.

### Testing strategy

Follows existing pattern (`node:test`, factory-with-injected-deps).

- **LocalStore tests** use a `tests/fixtures/leveldb-sample/` directory — a committed tiny LevelDB with a handful of synthesized Firestore documents per entity. Generator script lives at `tests/fixtures/build-leveldb-fixture.ts` and is reproducible.
- **Protobuf decoder tests** use hex-encoded sample protobufs for each entity type, captured once from the real cache, then redacted.
- **FirebaseRest tests** mock `fetch` directly; cover happy path, `OOB_CODE_INVALID`, `SEND_OOB_CODE_FAILED`, and network errors.
- **Tool handler tests** inject a mock `LocalStore` and (for writes) a mock `GraphQLClient` — no real I/O.
- **CLI tests** exercise `login` with stubbed `FirebaseRest` and captured stdout; verify keychain writes via a mock keychain.
- **Error-surface tests** assert that every `ErrorCode` added in this spec maps to an MCP-shaped error response with the expected message skeleton.

Fast feedback: keep `tests/fixtures/leveldb-sample/` small enough that `npm test` stays under ~5s locally.

### Migration

On first run after upgrade:

1. `AuthManager` deletes any stored password entry in the keychain (`copilot-money-auth / password`).
2. If a legacy daemon is running (socket exists), log a one-line warning and proceed; the old daemon is harmless but useless once ignored.
3. If the user had a valid token, it keeps working until expiry. No forced re-login.

No config file migration needed — settings live entirely in keychain and CLI args today.

## Risks and open questions

1. **Direct REST to `identitytoolkit.googleapis.com` may be App-Check-enforced.** Prior auth redesign doc (2026-03-27) claimed "only browser context works." Need empirical confirmation. If REST 401s, a Playwright-based sendOobCode fallback gets added back to the repo — isolated in `src/auth/firebaseBrowser.ts` so the rest of the stack doesn't change. Decide during implementation research.
2. **LevelDB read while app is running.** Need to verify Firestore's Electron SDK opens with shared or exclusive locks on macOS. If exclusive, `LOCAL_CACHE_LOCKED` is the only fallback and users must close the app before reading.
3. **2FA.** If the user has authenticator 2FA enabled, `signInWithEmailLink` returns `mfaPendingCredential` + `mfaInfo` and login completes via `accounts:finalizeMfaSignIn`. Support depends on verifying empirically whether 2FA is on; if not, implement a clear `MFA_REQUIRED` error that points users to disable 2FA for CLI use. Full MFA flow is out of scope unless we confirm the user needs it.
4. **Cache format drift.** Copilot ships app updates regularly. Decoders are defensive (unknown protobuf fields ignored, not errors). A surfaced `CACHE_DECODE_ERROR` tells users to file an issue and includes the first failing key prefix.
5. **Refresh-token experiment deferred.** We capture the refresh token during login and stash it, but don't exchange it at `securetoken.googleapis.com` in this iteration. Stays as a future follow-up.
6. **Scope for Phase 2 (11 new read tools)** is substantial — each entity needs a decoder, Zod schema, tool handler, tests, and `/review-code` grade A. The implementation plan sequences Phase 1 to ship on its own so we don't block on Phase 2.

## References

- Copilot Help Center — "Logging into Copilot": https://help.copilot.money/en/articles/9829510-logging-into-copilot
- Copilot Money Dispatch — 2026-03-18 (2FA), 2026-03-04 (login experience): https://www.copilot.money/dispatch
- Reference MCP (MIT): https://github.com/ignaciohermosillacornejo/copilot-money-mcp
- Reference CLI (JaviSoto): https://github.com/JaviSoto/copilot-money-cli
- Firebase `accounts:signInWithEmailLink`: https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithEmailLink
- Prior auth redesign spec: `docs/specs/2026-03-27-auth-redesign-design.md`
