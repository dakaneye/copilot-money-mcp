# Local Cache + Magic-Link Rewrite — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Playwright password automation with local Firestore cache reads and on-demand Firebase REST magic-link login, while keeping the MCP functional at every commit.

**Architecture:** Two independent backends — reads via `LocalStore` (LevelDB + protobuf, no auth), writes via GraphQL with on-demand magic-link login stored in macOS Keychain. No daemon, no Playwright, no password replay. See spec: `docs/specs/2026-04-17-local-cache-rewrite-design.md`.

**Tech Stack:** Node.js 20+, TypeScript, `classic-level` (LevelDB), `protobufjs`, global `fetch`, `keytar`, MCP SDK, Zod, `node:test`.

**Quality gates (every commit):**
1. `npm run build`
2. `npm run lint`
3. `npm test`
4. `/review-code` grade A (126+/140)

Each task ends green. No "fix it in the next commit."

**Phase 2** (10 new read tools for goals/holdings/investments) is out of scope for this plan. After Phase 1 ships, a separate plan covers Phase 2.

---

## File Structure

```
src/
├── server.ts                          # MODIFY: drop daemon wiring
├── cli.ts                             # REWRITE: magic-link-paste login, drop daemon subcommand
├── auth/
│   ├── index.ts                       # MODIFY: update exports
│   ├── keychain.ts                    # MODIFY: add refreshToken field, drop password
│   ├── manager.ts                     # REWRITE: thin keychain wrapper
│   ├── firebaseRest.ts                # NEW: sendOobCode, signInWithEmailLink, parseOobCodeFromUrl
│   ├── daemon.ts                      # DELETE (last)
│   ├── socket.ts                      # DELETE (last)
│   └── playwright.ts                  # DELETE (last)
├── localstore/
│   ├── index.ts                       # NEW: LocalStore facade
│   ├── path.ts                        # NEW: resolve cache directory
│   ├── leveldb.ts                     # NEW: read-only LevelDB iterator
│   ├── protobuf.ts                    # NEW: Firestore Document decoder
│   └── decoders/
│       ├── accounts.ts                # NEW
│       ├── categories.ts              # NEW
│       ├── tags.ts                    # NEW
│       ├── transactions.ts            # NEW
│       ├── recurring.ts               # NEW
│       └── budgets.ts                 # NEW
├── graphql/
│   ├── client.ts                      # UNCHANGED (still used for writes)
│   ├── mutations.ts                   # UNCHANGED
│   ├── fragments.ts                   # MODIFY/DELETE if only used by queries
│   └── queries.ts                     # DELETE (last)
├── tools/
│   ├── index.ts                       # MODIFY: remove TTL cache, wire LocalStore
│   ├── accounts.ts                    # MODIFY: use LocalStore
│   ├── categories.ts                  # MODIFY: use LocalStore
│   ├── tags.ts                        # MODIFY: use LocalStore
│   ├── transactions.ts                # MODIFY: use LocalStore
│   ├── recurring.ts                   # MODIFY: use LocalStore
│   ├── budgets.ts                     # MODIFY: use LocalStore
│   ├── cache_status.ts                # NEW: get_cache_status
│   ├── categorize.ts                  # MODIFY: TOKEN_EXPIRED message only
│   ├── review.ts                      # MODIFY: TOKEN_EXPIRED message only
│   ├── tag.ts                         # MODIFY: TOKEN_EXPIRED message only
│   ├── bulk.ts                        # MODIFY: TOKEN_EXPIRED message only
│   └── suggest.ts                     # MODIFY: use LocalStore for candidates
└── types/
    ├── error.ts                       # MODIFY: add new ErrorCodes
    └── ...                            # UNCHANGED

tests/
├── auth/
│   ├── firebaseRest.test.ts           # NEW
│   ├── manager.test.ts                # REWRITE: keychain-only
│   ├── keychain.test.ts               # MODIFY
│   ├── daemon.test.ts                 # DELETE (last)
│   ├── socket.test.ts                 # DELETE (last)
│   └── playwright.test.ts             # DELETE (last)
├── localstore/
│   ├── path.test.ts                   # NEW
│   ├── leveldb.test.ts                # NEW
│   ├── protobuf.test.ts               # NEW
│   ├── index.test.ts                  # NEW
│   └── decoders/*.test.ts             # NEW (one per decoder)
├── tools/
│   ├── *.test.ts                      # MODIFY: inject LocalStore instead of GraphQLClient
│   └── cache_status.test.ts           # NEW
└── fixtures/
    ├── build-leveldb-fixture.ts       # NEW: generator script
    ├── leveldb-sample/                # NEW: committed tiny LevelDB
    └── protobuf-samples/              # NEW: committed hex-encoded Firestore docs

docs/
├── research/
│   └── 2026-04-17-firestore-leveldb-format.md  # NEW: findings from Task 1
└── specs/
    └── 2026-04-17-local-cache-rewrite-design.md  # EXISTS
```

---

## Phase A — Setup and Research

### Task 1: Create feature branch and research Firestore LevelDB format

**Files:**
- Create: `docs/research/2026-04-17-firestore-leveldb-format.md`

- [ ] **Step 1: Create branch**

```bash
git checkout -b dakaneye/local-cache-rewrite
```

Expected: switched to new branch. Existing uncommitted CLAUDE.md and package-lock.json changes come along; they're out of scope for this plan and stay uncommitted until the user deals with them separately.

- [ ] **Step 2: Capture a sample of user's LevelDB for research**

```bash
CACHE_DIR="$HOME/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main"
ls "$CACHE_DIR" | head -20
```

Expected: `.log`, `.ldb`, `CURRENT`, `LOCK`, `MANIFEST-*` files. If the directory doesn't exist, stop and ask the user to open Copilot Money once, then retry.

- [ ] **Step 3: Study reference MCP's LevelDB + protobuf approach**

```bash
mkdir -p /tmp/research-ref-mcp
cd /tmp/research-ref-mcp
git clone --depth 1 https://github.com/ignaciohermosillacornejo/copilot-money-mcp.git
find copilot-money-mcp/src -name '*.ts' | xargs grep -l -i 'leveldb\|protobuf\|classic-level\|level(-\|down)' | head
```

Read the files this returns. Note: package.json dependencies for LevelDB lib and protobuf lib, and the file(s) that decode Firestore documents.

- [ ] **Step 4: Write research doc**

```markdown
# Firestore LevelDB Format Research (2026-04-17)

## Cache location
- macOS: `~/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main`

## Library choices (from reference MCP)
- LevelDB: <actual package from reference, e.g. `classic-level` or `level`>
- Protobuf: <actual package, e.g. `protobufjs`>

## LevelDB key structure
<documented prefixes for: remote_documents, mutations, target_globals, etc.>
Example keys observed: <literal hex/string of first 20 keys from user's cache>

## Value protobuf schema
- `remote_documents/*` values are `google.firestore.v1.Document` or firestore-internal `MaybeDocument`
- Schema source: <URL to .proto file or npm package that ships it>

## Entity key prefixes
- Transactions: <prefix>
- Accounts: <prefix>
- Categories: <prefix>
- Tags: <prefix>
- Recurring: <prefix>
- Budgets: <prefix>

## Open questions
- <anything that needs empirical verification during implementation>
```

Fill in the `<...>` slots with real values. This doc is the source of truth for Tasks 3–7.

- [ ] **Step 5: Commit**

```bash
git add docs/research/2026-04-17-firestore-leveldb-format.md
git commit -m "docs: research firestore leveldb format"
```

---

### Task 2: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps chosen in research**

Use the exact packages identified in Task 1 Step 4. If research identified `classic-level` and `protobufjs`:

```bash
npm install classic-level protobufjs
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add classic-level and protobufjs for local cache reads"
```

(Adjust commit message to match the actual packages chosen.)

---

## Phase B — Error Taxonomy

### Task 3: Extend error codes

**Files:**
- Modify: `src/types/error.ts`
- Modify: `tests/auth/manager.test.ts` (or wherever ErrorCode is most directly tested)

- [ ] **Step 1: Write failing test for new error codes**

```typescript
// tests/types/error.test.ts (create this file if it doesn't exist)
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CopilotMoneyError } from '../../src/types/error.js';

describe('CopilotMoneyError new codes', () => {
  test('LOCAL_CACHE_MISSING round-trips to MCP error', () => {
    const err = new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      'Copilot Money not installed or never opened.'
    );
    const mcp = err.toMcpError();
    assert.strictEqual(mcp.code, 'LOCAL_CACHE_MISSING');
  });

  test('LOCAL_CACHE_LOCKED', () => {
    const err = new CopilotMoneyError('LOCAL_CACHE_LOCKED', 'x');
    assert.strictEqual(err.toMcpError().code, 'LOCAL_CACHE_LOCKED');
  });

  test('ENTITY_NOT_CACHED carries suggestions', () => {
    const err = new CopilotMoneyError('ENTITY_NOT_CACHED', 'x', ['2026-01', '2026-02']);
    assert.deepStrictEqual(err.toMcpError().suggestions, ['2026-01', '2026-02']);
  });

  test('OOB_CODE_INVALID', () => {
    assert.strictEqual(new CopilotMoneyError('OOB_CODE_INVALID', 'x').toMcpError().code, 'OOB_CODE_INVALID');
  });

  test('SEND_OOB_CODE_FAILED', () => {
    assert.strictEqual(new CopilotMoneyError('SEND_OOB_CODE_FAILED', 'x').toMcpError().code, 'SEND_OOB_CODE_FAILED');
  });

  test('CACHE_DECODE_ERROR', () => {
    assert.strictEqual(new CopilotMoneyError('CACHE_DECODE_ERROR', 'x').toMcpError().code, 'CACHE_DECODE_ERROR');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="CopilotMoneyError new codes"
```

Expected: FAIL with TypeScript errors about unknown ErrorCode values.

- [ ] **Step 3: Extend ErrorCode union**

```typescript
// src/types/error.ts
export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_CATEGORY'
  | 'INVALID_TAG'
  | 'TRANSACTION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'GRAPHQL_ERROR'
  | 'PARTIAL_FAILURE'
  | 'LOCAL_CACHE_MISSING'
  | 'LOCAL_CACHE_LOCKED'
  | 'ENTITY_NOT_CACHED'
  | 'OOB_CODE_INVALID'
  | 'SEND_OOB_CODE_FAILED'
  | 'CACHE_DECODE_ERROR';
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/types/error.ts tests/types/error.test.ts
git commit -m "feat(errors): add local-cache and magic-link error codes"
```

---

## Phase C — Firebase REST Login

### Task 4: Firebase REST client — `parseOobCodeFromUrl`

**Files:**
- Create: `src/auth/firebaseRest.ts`
- Create: `tests/auth/firebaseRest.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/auth/firebaseRest.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseOobCodeFromUrl } from '../../src/auth/firebaseRest.js';

describe('parseOobCodeFromUrl', () => {
  test('extracts oobCode from standard Firebase magic link', () => {
    const url = 'https://copilot-production-22904.firebaseapp.com/__/auth/action?apiKey=AIzaSy&mode=signIn&oobCode=ABC123&continueUrl=https://app.copilot.money&lang=en';
    assert.strictEqual(parseOobCodeFromUrl(url), 'ABC123');
  });

  test('handles URL with extra whitespace', () => {
    const url = '  https://example.com/__/auth/action?mode=signIn&oobCode=XYZ  ';
    assert.strictEqual(parseOobCodeFromUrl(url), 'XYZ');
  });

  test('throws CopilotMoneyError OOB_CODE_INVALID when oobCode missing', () => {
    const url = 'https://example.com/__/auth/action?mode=signIn';
    assert.throws(
      () => parseOobCodeFromUrl(url),
      (err: Error) => err.name === 'CopilotMoneyError' && (err as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws OOB_CODE_INVALID when not a URL', () => {
    assert.throws(
      () => parseOobCodeFromUrl('not a url'),
      (err: Error) => (err as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws OOB_CODE_INVALID when mode is not signIn', () => {
    const url = 'https://example.com/__/auth/action?mode=resetPassword&oobCode=X';
    assert.throws(
      () => parseOobCodeFromUrl(url),
      (err: Error) => (err as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="parseOobCodeFromUrl"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/auth/firebaseRest.ts
import { CopilotMoneyError } from '../types/error.js';

export function parseOobCodeFromUrl(pasted: string): string {
  const trimmed = pasted.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Pasted value is not a valid URL.');
  }
  const mode = url.searchParams.get('mode');
  const oobCode = url.searchParams.get('oobCode');
  if (mode !== 'signIn') {
    throw new CopilotMoneyError(
      'OOB_CODE_INVALID',
      `Expected a sign-in link (mode=signIn), got mode=${mode ?? 'unknown'}.`
    );
  }
  if (!oobCode) {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Sign-in link missing oobCode parameter.');
  }
  return oobCode;
}
```

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/auth/firebaseRest.ts tests/auth/firebaseRest.test.ts
git commit -m "feat(auth): add parseOobCodeFromUrl helper"
```

---

### Task 5: Firebase REST client — `sendOobCode`

**Files:**
- Modify: `src/auth/firebaseRest.ts`
- Modify: `tests/auth/firebaseRest.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to tests/auth/firebaseRest.test.ts
import { sendOobCode, COPILOT_FIREBASE_API_KEY } from '../../src/auth/firebaseRest.js';

describe('sendOobCode', () => {
  test('POSTs to identitytoolkit with EMAIL_SIGNIN body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ email: 'a@b.com' }), { status: 200 });
    };

    await sendOobCode({ email: 'a@b.com', continueUrl: 'https://app.copilot.money' }, { fetch: fakeFetch });

    assert.ok(capturedUrl?.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode'));
    assert.ok(capturedUrl.includes(`key=${COPILOT_FIREBASE_API_KEY}`));
    assert.strictEqual(capturedInit?.method, 'POST');
    const body = JSON.parse(String(capturedInit?.body));
    assert.strictEqual(body.requestType, 'EMAIL_SIGNIN');
    assert.strictEqual(body.email, 'a@b.com');
    assert.strictEqual(body.continueUrl, 'https://app.copilot.money');
  });

  test('throws SEND_OOB_CODE_FAILED on non-2xx', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'QUOTA_EXCEEDED' } }), { status: 429 });
    await assert.rejects(
      () => sendOobCode({ email: 'a@b.com', continueUrl: 'x' }, { fetch: fakeFetch }),
      (err: Error) => (err as { code: string }).code === 'SEND_OOB_CODE_FAILED'
    );
  });

  test('throws SEND_OOB_CODE_FAILED on network error', async () => {
    const fakeFetch: typeof fetch = async () => { throw new Error('ECONNREFUSED'); };
    await assert.rejects(
      () => sendOobCode({ email: 'a@b.com', continueUrl: 'x' }, { fetch: fakeFetch }),
      (err: Error) => (err as { code: string }).code === 'SEND_OOB_CODE_FAILED'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="sendOobCode"
```

Expected: FAIL — symbols not exported.

- [ ] **Step 3: Implement**

```typescript
// Append to src/auth/firebaseRest.ts
export const COPILOT_FIREBASE_API_KEY = 'AIzaSyAMgjkeOSkHj4J4rlswOkD16N3WQOoNPpk';
const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

export interface SendOobCodeParams {
  email: string;
  continueUrl: string;
}

export interface FirebaseRestDeps {
  fetch?: typeof fetch;
}

export async function sendOobCode(
  params: SendOobCodeParams,
  deps: FirebaseRestDeps = {}
): Promise<void> {
  const f = deps.fetch ?? fetch;
  const url = `${IDENTITY_TOOLKIT_BASE}:sendOobCode?key=${COPILOT_FIREBASE_API_KEY}`;
  let resp: Response;
  try {
    resp = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestType: 'EMAIL_SIGNIN',
        email: params.email,
        continueUrl: params.continueUrl,
      }),
    });
  } catch (err) {
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      `Network error sending sign-in email: ${(err as Error).message}`
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      `Copilot rejected the sign-in request (HTTP ${resp.status}). If this persists you may be App-Check-throttled; wait 24h. Body: ${text.slice(0, 200)}`
    );
  }
}
```

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/auth/firebaseRest.ts tests/auth/firebaseRest.test.ts
git commit -m "feat(auth): add sendOobCode REST call"
```

---

### Task 6: Firebase REST client — `signInWithEmailLink`

**Files:**
- Modify: `src/auth/firebaseRest.ts`
- Modify: `tests/auth/firebaseRest.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to tests/auth/firebaseRest.test.ts
import { signInWithEmailLink } from '../../src/auth/firebaseRest.js';

describe('signInWithEmailLink', () => {
  function sampleJwt(expSecondsFromNow: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow, sub: 'uid' })
    ).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  test('returns idToken, refreshToken, expiresAt on success', async () => {
    const idToken = sampleJwt(3600);
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          idToken,
          refreshToken: 'REFRESH',
          localId: 'uid',
          email: 'a@b.com',
          expiresIn: '3600',
        }),
        { status: 200 }
      );
    const result = await signInWithEmailLink(
      { email: 'a@b.com', oobCode: 'X' },
      { fetch: fakeFetch }
    );
    assert.strictEqual(result.idToken, idToken);
    assert.strictEqual(result.refreshToken, 'REFRESH');
    assert.strictEqual(result.email, 'a@b.com');
    assert.ok(result.expiresAt > Date.now());
    assert.ok(result.expiresAt < Date.now() + 3601 * 1000);
  });

  test('throws OOB_CODE_INVALID on INVALID_OOB_CODE error', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: 'INVALID_OOB_CODE' } }),
        { status: 400 }
      );
    await assert.rejects(
      () => signInWithEmailLink({ email: 'a@b.com', oobCode: 'X' }, { fetch: fakeFetch }),
      (err: Error) => (err as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws OOB_CODE_INVALID on EXPIRED_OOB_CODE', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'EXPIRED_OOB_CODE' } }), { status: 400 });
    await assert.rejects(
      () => signInWithEmailLink({ email: 'a@b.com', oobCode: 'X' }, { fetch: fakeFetch }),
      (err: Error) => (err as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws SEND_OOB_CODE_FAILED on other non-2xx', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'INTERNAL' } }), { status: 500 });
    await assert.rejects(
      () => signInWithEmailLink({ email: 'a@b.com', oobCode: 'X' }, { fetch: fakeFetch }),
      (err: Error) => (err as { code: string }).code === 'SEND_OOB_CODE_FAILED'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="signInWithEmailLink"
```

Expected: FAIL — symbol not exported.

- [ ] **Step 3: Implement**

```typescript
// Append to src/auth/firebaseRest.ts
export interface SignInResult {
  idToken: string;
  refreshToken: string;
  email: string;
  localId: string;
  expiresAt: number;
}

function parseJwtExp(token: string): number {
  const parts = token.split('.');
  if (parts.length !== 3) throw new CopilotMoneyError('OOB_CODE_INVALID', 'Invalid JWT from Firebase.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (!payload.exp) throw new CopilotMoneyError('OOB_CODE_INVALID', 'JWT missing exp claim.');
  return payload.exp * 1000;
}

export async function signInWithEmailLink(
  params: { email: string; oobCode: string },
  deps: FirebaseRestDeps = {}
): Promise<SignInResult> {
  const f = deps.fetch ?? fetch;
  const url = `${IDENTITY_TOOLKIT_BASE}:signInWithEmailLink?key=${COPILOT_FIREBASE_API_KEY}`;
  const resp = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: params.email, oobCode: params.oobCode }),
  }).catch((err: Error) => {
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      `Network error completing sign-in: ${err.message}`
    );
  });

  const body = await resp.json().catch(() => ({})) as {
    idToken?: string;
    refreshToken?: string;
    localId?: string;
    email?: string;
    error?: { message?: string };
  };

  if (!resp.ok) {
    const msg = body.error?.message ?? `HTTP ${resp.status}`;
    if (msg === 'INVALID_OOB_CODE' || msg === 'EXPIRED_OOB_CODE') {
      throw new CopilotMoneyError(
        'OOB_CODE_INVALID',
        'Sign-in link invalid or expired. Run `copilot-auth login` again to get a new one.'
      );
    }
    throw new CopilotMoneyError('SEND_OOB_CODE_FAILED', `Firebase rejected sign-in: ${msg}`);
  }

  if (!body.idToken || !body.refreshToken || !body.localId || !body.email) {
    throw new CopilotMoneyError('SEND_OOB_CODE_FAILED', 'Firebase sign-in response missing fields.');
  }

  return {
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    email: body.email,
    localId: body.localId,
    expiresAt: parseJwtExp(body.idToken),
  };
}
```

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/auth/firebaseRest.ts tests/auth/firebaseRest.test.ts
git commit -m "feat(auth): add signInWithEmailLink REST call"
```

---

### Task 7: Keychain — add refreshToken field, drop password

**Files:**
- Modify: `src/auth/keychain.ts`
- Modify: `tests/auth/keychain.test.ts`

- [ ] **Step 1: Read current `src/auth/keychain.ts` fully before editing.**

- [ ] **Step 2: Write failing tests for new fields**

Add tests that verify: (a) `setToken` accepts and persists `refreshToken` and `email` alongside `token` and `expiresAt`; (b) `getToken` returns all four; (c) `clearCredentials` deletes the password entry if present (migration path); (d) the password setter/getter are removed from the public API.

```typescript
// tests/auth/keychain.test.ts — additions; adapt existing mock-keytar pattern
describe('keychain after rewrite', () => {
  test('setToken persists token, expiresAt, email, refreshToken', async () => {
    /* ... assert serialized JSON contains all four fields ... */
  });

  test('getToken returns full shape', async () => {
    /* ... */
  });

  test('clearCredentials deletes password entry and token entry', async () => {
    /* ... assert two deletePassword calls, one per entry ... */
  });

  test('storeCredentials is no longer exported', async () => {
    const mod = await import('../../src/auth/keychain.js') as Record<string, unknown>;
    assert.strictEqual(mod.storeCredentials, undefined);
  });
});
```

Flesh out the `/* ... */` blocks with the exact mock pattern already used in this test file (see `tests/auth/keychain.test.ts` existing tests — copy that structure).

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="keychain after rewrite"
```

Expected: FAIL.

- [ ] **Step 4: Implement**

- Change `StoredToken` interface in `keychain.ts` to include `refreshToken: string` and `email: string`.
- Remove `storeCredentials` / `getCredentials` / any password-related public functions.
- Keep the service name `copilot-money-auth`, account `token` for the token JSON, account `credentials` for password (for migration deletion only).
- `clearCredentials()` deletes both `token` and `credentials` accounts.

- [ ] **Step 5: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green. **Note:** tests in `tests/auth/daemon.test.ts`, `tests/auth/playwright.test.ts`, and `tests/auth/socket.test.ts` may now fail to compile due to removed exports. **Don't fix them here.** Instead, temporarily mark their `*.test.ts` file extensions to `.test.ts.skip` in this commit so they don't run; they get deleted in Task 20 along with their source files.

```bash
mv tests/auth/daemon.test.ts tests/auth/daemon.test.ts.skip
mv tests/auth/playwright.test.ts tests/auth/playwright.test.ts.skip
mv tests/auth/socket.test.ts tests/auth/socket.test.ts.skip
```

Also check `src/auth/daemon.ts`, `src/auth/playwright.ts`, `src/auth/socket.ts`, `src/auth/manager.ts`, and `src/cli.ts` for references to the removed password APIs. If any reference them at build time, stub them with a throwing `CopilotMoneyError('NOT_AUTHENTICATED', 'Legacy password flow removed; run `copilot-auth login`.')`. These stubs get deleted in Task 20.

- [ ] **Step 6: Commit**

```bash
git add -A src/auth/ tests/auth/
git commit -m "refactor(auth): store refreshToken+email in keychain, drop password"
```

---

### Task 8: Rewrite AuthManager as thin keychain wrapper

**Files:**
- Rewrite: `src/auth/manager.ts`
- Rewrite: `tests/auth/manager.test.ts`

- [ ] **Step 1: Read current `src/auth/manager.ts` fully.**

- [ ] **Step 2: Write failing tests**

```typescript
// tests/auth/manager.test.ts — REPLACE existing tests
import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { createAuthManager } from '../../src/auth/manager.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockKeychain(initial: { token: string; expiresAt: number; email: string; refreshToken: string } | null) {
  let state = initial;
  return {
    getToken: mock.fn(async () => state),
    setToken: mock.fn(async (v: typeof state) => { state = v; }),
    clearCredentials: mock.fn(async () => { state = null; }),
  };
}

describe('AuthManager', () => {
  test('getToken returns valid JWT when not expired', async () => {
    const keychain = mockKeychain({
      token: 'jwt', expiresAt: Date.now() + 10 * 60 * 1000,
      email: 'a@b.com', refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    assert.strictEqual(await auth.getToken(), 'jwt');
  });

  test('getToken throws TOKEN_EXPIRED when expired', async () => {
    const keychain = mockKeychain({
      token: 'jwt', expiresAt: Date.now() - 1000,
      email: 'a@b.com', refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    await assert.rejects(
      () => auth.getToken(),
      (err: Error) => (err as { code: string }).code === 'TOKEN_EXPIRED'
    );
  });

  test('getToken throws TOKEN_EXPIRED when within 60s buffer', async () => {
    const keychain = mockKeychain({
      token: 'jwt', expiresAt: Date.now() + 30 * 1000,
      email: 'a@b.com', refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    await assert.rejects(() => auth.getToken(), (err: Error) => (err as { code: string }).code === 'TOKEN_EXPIRED');
  });

  test('getToken throws NOT_AUTHENTICATED when keychain empty', async () => {
    const keychain = mockKeychain(null);
    const auth = createAuthManager({ keychain });
    await assert.rejects(
      () => auth.getToken(),
      (err: Error) => (err as { code: string }).code === 'NOT_AUTHENTICATED'
    );
  });

  test('setToken persists to keychain', async () => {
    const keychain = mockKeychain(null);
    const auth = createAuthManager({ keychain });
    await auth.setToken({ token: 't', expiresAt: 1, email: 'e', refreshToken: 'r' });
    assert.strictEqual(keychain.setToken.mock.calls.length, 1);
  });

  test('logout clears keychain', async () => {
    const keychain = mockKeychain({
      token: 'jwt', expiresAt: Date.now() + 10000,
      email: 'a@b.com', refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    await auth.logout();
    assert.strictEqual(keychain.clearCredentials.mock.calls.length, 1);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="AuthManager"
```

Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// src/auth/manager.ts
import { CopilotMoneyError } from '../types/error.js';

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export interface KeychainPort {
  getToken(): Promise<{ token: string; expiresAt: number; email: string; refreshToken: string } | null>;
  setToken(v: { token: string; expiresAt: number; email: string; refreshToken: string }): Promise<void>;
  clearCredentials(): Promise<void>;
}

export interface AuthManager {
  getToken(): Promise<string>;
  setToken(v: { token: string; expiresAt: number; email: string; refreshToken: string }): Promise<void>;
  logout(): Promise<void>;
  getEmail(): Promise<string | null>;
}

export function createAuthManager(deps: { keychain: KeychainPort }): AuthManager {
  const { keychain } = deps;
  return {
    async getToken() {
      const stored = await keychain.getToken();
      if (!stored) throw new CopilotMoneyError('NOT_AUTHENTICATED', 'Not logged in. Run `copilot-auth login`.');
      if (stored.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= Date.now()) {
        throw new CopilotMoneyError(
          'TOKEN_EXPIRED',
          'Authentication expired. Run `copilot-auth login` in your terminal, then retry.'
        );
      }
      return stored.token;
    },
    setToken: (v) => keychain.setToken(v),
    logout: () => keychain.clearCredentials(),
    async getEmail() {
      const stored = await keychain.getToken();
      return stored?.email ?? null;
    },
  };
}
```

- [ ] **Step 5: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/auth/manager.ts tests/auth/manager.test.ts
git commit -m "refactor(auth): AuthManager becomes thin keychain wrapper"
```

---

### Task 9: Rewrite CLI `login` command to use magic-link-paste

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli.test.ts` (if not present)

- [ ] **Step 1: Read current `src/cli.ts` fully.**

- [ ] **Step 2: Write test for the login orchestrator (extract as pure function)**

Extract the login logic into a pure function `loginFlow(deps)` where `deps` contain `firebaseRest`, `keychain`, `prompt`, and `print`. Test that:
- It prompts for email
- It calls `sendOobCode` with that email
- It prints the "check your email" message
- It prompts for the URL
- It parses the oobCode
- It calls `signInWithEmailLink`
- It persists result to keychain
- It prints success

```typescript
// tests/cli.test.ts
import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { loginFlow } from '../src/cli.js';

describe('loginFlow', () => {
  test('happy path: email → sendOobCode → paste URL → signInWithEmailLink → keychain', async () => {
    const prompts: string[] = [];
    const prints: string[] = [];
    const deps = {
      firebaseRest: {
        sendOobCode: mock.fn(async () => {}),
        signInWithEmailLink: mock.fn(async () => ({
          idToken: 'jwt', refreshToken: 'r', email: 'a@b.com', localId: 'u',
          expiresAt: Date.now() + 3600000,
        })),
        parseOobCodeFromUrl: mock.fn(() => 'CODE'),
      },
      keychain: {
        setToken: mock.fn(async () => {}),
      },
      prompt: mock.fn(async (q: string) => {
        prompts.push(q);
        return prompts.length === 1 ? 'a@b.com' : 'https://link/?oobCode=CODE&mode=signIn';
      }),
      print: (s: string) => { prints.push(s); },
    };
    await loginFlow(deps);
    assert.strictEqual(deps.firebaseRest.sendOobCode.mock.calls.length, 1);
    assert.strictEqual(deps.firebaseRest.signInWithEmailLink.mock.calls.length, 1);
    assert.strictEqual(deps.keychain.setToken.mock.calls.length, 1);
    assert.ok(prints.some((p) => p.includes('Logged in')));
  });

  test('aborts if sendOobCode fails', async () => {
    const deps = {
      firebaseRest: {
        sendOobCode: mock.fn(async () => { throw new Error('boom'); }),
        signInWithEmailLink: mock.fn(async () => { throw new Error('not called'); }),
        parseOobCodeFromUrl: mock.fn(() => 'X'),
      },
      keychain: { setToken: mock.fn(async () => {}) },
      prompt: mock.fn(async () => 'a@b.com'),
      print: () => {},
    };
    await assert.rejects(() => loginFlow(deps));
    assert.strictEqual(deps.firebaseRest.signInWithEmailLink.mock.calls.length, 0);
    assert.strictEqual(deps.keychain.setToken.mock.calls.length, 0);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="loginFlow"
```

Expected: FAIL.

- [ ] **Step 4: Implement `loginFlow` in `src/cli.ts`**

Extract the login orchestration into an exported pure function. Keep the I/O bindings (readline, stdout) in a thin `main()` that wires real deps into `loginFlow`. Remove the `daemon start|stop|status` subcommands. Keep `status`, `logout`, `login`. Have `main()` dispatch on `argv[2]`.

```typescript
// Shape inside src/cli.ts
export interface LoginDeps {
  firebaseRest: {
    sendOobCode: (p: { email: string; continueUrl: string }) => Promise<void>;
    signInWithEmailLink: (p: { email: string; oobCode: string }) => Promise<{
      idToken: string; refreshToken: string; email: string; localId: string; expiresAt: number;
    }>;
    parseOobCodeFromUrl: (url: string) => string;
  };
  keychain: { setToken: (v: { token: string; expiresAt: number; email: string; refreshToken: string }) => Promise<void> };
  prompt: (q: string) => Promise<string>;
  print: (s: string) => void;
}

export async function loginFlow(deps: LoginDeps): Promise<void> {
  const email = (await deps.prompt('Email: ')).trim();
  deps.print('Sending sign-in email...');
  await deps.firebaseRest.sendOobCode({ email, continueUrl: 'https://app.copilot.money' });
  deps.print('Email sent. Open the email from Copilot and paste the sign-in URL here.');
  const pasted = await deps.prompt('URL: ');
  const oobCode = deps.firebaseRest.parseOobCodeFromUrl(pasted);
  const result = await deps.firebaseRest.signInWithEmailLink({ email, oobCode });
  await deps.keychain.setToken({
    token: result.idToken,
    expiresAt: result.expiresAt,
    email: result.email,
    refreshToken: result.refreshToken,
  });
  const minutes = Math.floor((result.expiresAt - Date.now()) / 60000);
  deps.print(`Logged in as ${result.email}. Token valid ~${minutes} min.`);
}
```

The `main()` function uses `readline` for `prompt` and `console.log` for `print`. Remove all Playwright imports, password prompts, and daemon subcommands from `main()`.

- [ ] **Step 5: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): magic-link-paste login replaces password flow"
```

---

## Phase D — LocalStore Foundation

### Task 10: `localstore/path.ts`

**Files:**
- Create: `src/localstore/path.ts`
- Create: `tests/localstore/path.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/localstore/path.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCachePath, defaultCacheRoot } from '../../src/localstore/path.js';

describe('resolveCachePath', () => {
  test('returns the Copilot Money Firestore main dir path string', () => {
    const p = defaultCacheRoot('/Users/alice');
    assert.strictEqual(
      p,
      '/Users/alice/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main'
    );
  });

  test('throws LOCAL_CACHE_MISSING when directory does not exist', async () => {
    const fakeHome = join(tmpdir(), `copilot-mcp-test-${Date.now()}`);
    mkdirSync(fakeHome, { recursive: true });
    try {
      await assert.rejects(
        () => resolveCachePath({ home: fakeHome }),
        (err: Error) => (err as { code: string }).code === 'LOCAL_CACHE_MISSING'
      );
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('returns path when directory exists', async () => {
    const fakeHome = join(tmpdir(), `copilot-mcp-test-${Date.now()}-ok`);
    const cacheDir = join(
      fakeHome,
      'Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main'
    );
    mkdirSync(cacheDir, { recursive: true });
    try {
      const resolved = await resolveCachePath({ home: fakeHome });
      assert.strictEqual(resolved, cacheDir);
      assert.ok(existsSync(resolved));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="resolveCachePath"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/localstore/path.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CopilotMoneyError } from '../types/error.js';

const CACHE_SUBPATH =
  'Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main';

export function defaultCacheRoot(home: string): string {
  return join(home, CACHE_SUBPATH);
}

export async function resolveCachePath(deps: { home?: string } = {}): Promise<string> {
  const home = deps.home ?? homedir();
  const path = defaultCacheRoot(home);
  if (!existsSync(path)) {
    throw new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      'Copilot Money not installed or never opened. Install it from the App Store and open it once, then retry.'
    );
  }
  return path;
}
```

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/localstore/path.ts tests/localstore/path.test.ts
git commit -m "feat(localstore): resolve Firestore cache path"
```

---

### Task 11: `localstore/leveldb.ts` — read-only iterator + fixture generator

**Files:**
- Create: `src/localstore/leveldb.ts`
- Create: `tests/localstore/leveldb.test.ts`
- Create: `tests/fixtures/build-leveldb-fixture.ts`
- Create: `tests/fixtures/leveldb-sample/` (generated directory)

- [ ] **Step 1: Write the fixture generator script**

Using the library chosen in Task 1, write a script that creates `tests/fixtures/leveldb-sample/` with ~10 keys using realistic Firestore key prefixes (from the research doc) and short JSON-byte values (not real protobuf — we're just testing LevelDB iteration here; protobuf tests come in Task 12).

```typescript
// tests/fixtures/build-leveldb-fixture.ts
// Run with: npx tsx tests/fixtures/build-leveldb-fixture.ts
import { ClassicLevel } from 'classic-level';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const DIR = join(import.meta.dirname, 'leveldb-sample');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const db = new ClassicLevel<string, Uint8Array>(DIR, { valueEncoding: 'view' });
await db.open();
// Use key prefixes from the research doc. Example shapes:
await db.put('remote_documents/transactions/txn-1', Buffer.from(JSON.stringify({ amount: 100 })));
await db.put('remote_documents/transactions/txn-2', Buffer.from(JSON.stringify({ amount: 200 })));
await db.put('remote_documents/accounts/acct-1', Buffer.from(JSON.stringify({ name: 'Checking' })));
await db.put('remote_documents/categories/cat-1', Buffer.from(JSON.stringify({ name: 'Food' })));
await db.put('target_globals/x', Buffer.from([]));
await db.close();
console.log('fixture written to', DIR);
```

- [ ] **Step 2: Run the fixture generator**

```bash
npx tsx tests/fixtures/build-leveldb-fixture.ts
```

Expected: prints fixture path, directory is populated.

- [ ] **Step 3: Write failing tests**

```typescript
// tests/localstore/leveldb.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { openReadOnly } from '../../src/localstore/leveldb.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'leveldb-sample');

describe('openReadOnly', () => {
  test('opens the fixture and iterates keys with a prefix', async () => {
    const db = await openReadOnly(FIXTURE);
    const keys: string[] = [];
    for await (const key of db.keysWithPrefix('remote_documents/transactions/')) {
      keys.push(key);
    }
    await db.close();
    assert.deepStrictEqual(keys.sort(), [
      'remote_documents/transactions/txn-1',
      'remote_documents/transactions/txn-2',
    ]);
  });

  test('reads value bytes by key', async () => {
    const db = await openReadOnly(FIXTURE);
    const value = await db.get('remote_documents/accounts/acct-1');
    await db.close();
    assert.ok(value);
    assert.strictEqual(JSON.parse(Buffer.from(value!).toString()).name, 'Checking');
  });

  test('throws LOCAL_CACHE_LOCKED when LOCK held by other process', async () => {
    // Simulate: open the fixture in exclusive mode, try to open read-only in another handle.
    // If classic-level allows multi-reader, skip this assertion and document that behavior.
    // Implementation: use a separate DB instance to hold an exclusive lock, then attempt open.
    // If the chosen lib allows concurrent readers, replace this test with one that asserts
    // an invalid path (non-directory) surfaces LOCAL_CACHE_LOCKED or LOCAL_CACHE_MISSING per spec.
  });
});
```

For the `LOCAL_CACHE_LOCKED` test: the research task should confirm whether `classic-level` supports multiple readers on the same directory. If yes, this specific test is replaced with a test that simulates a lock error by calling `openReadOnly` on a path that exists but has a held `LOCK` file. If no, hold the lock in the test via a second DB handle and assert the error. **Include whichever variant fits the library's actual behavior — do not ship a skipped test.**

- [ ] **Step 4: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="openReadOnly"
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement**

```typescript
// src/localstore/leveldb.ts
import { ClassicLevel } from 'classic-level';
import { CopilotMoneyError } from '../types/error.js';

export interface LevelDbReader {
  keysWithPrefix(prefix: string): AsyncIterable<string>;
  get(key: string): Promise<Uint8Array | undefined>;
  close(): Promise<void>;
}

export async function openReadOnly(path: string): Promise<LevelDbReader> {
  const db = new ClassicLevel<string, Uint8Array>(path, {
    valueEncoding: 'view',
    readOnly: true,
  });
  try {
    await db.open();
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (/LOCK/.test(message) || /exclusive/i.test(message)) {
      throw new CopilotMoneyError(
        'LOCAL_CACHE_LOCKED',
        'Copilot Money is open and holding an exclusive lock on its cache. Close the app or retry.'
      );
    }
    throw new CopilotMoneyError('LOCAL_CACHE_MISSING', `Cannot open local cache: ${message}`);
  }
  return {
    async *keysWithPrefix(prefix: string) {
      const end = prefix + '\uffff';
      for await (const key of db.keys({ gte: prefix, lte: end })) {
        yield key as string;
      }
    },
    async get(key: string) {
      try {
        return await db.get(key);
      } catch (err) {
        if ((err as { code?: string }).code === 'LEVEL_NOT_FOUND') return undefined;
        throw err;
      }
    },
    close: () => db.close(),
  };
}
```

Adjust `readOnly` flag and error-detection regex based on what the chosen LevelDB library actually does. If `classic-level` does not support `readOnly: true`, open normally — the spec's guarantee is "we don't write," not a filesystem-level read-only lock.

- [ ] **Step 6: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/localstore/leveldb.ts tests/localstore/leveldb.test.ts tests/fixtures/
git commit -m "feat(localstore): add LevelDB read-only reader with fixture"
```

---

### Task 12: `localstore/protobuf.ts` — Firestore Document decoder

**Files:**
- Create: `src/localstore/protobuf.ts`
- Create: `tests/localstore/protobuf.test.ts`
- Create: `tests/fixtures/protobuf-samples/` (committed hex samples)

- [ ] **Step 1: Capture 1 real sample from the research doc's cache and redact it**

Follow the research doc's notes for which key prefix holds a Document. Capture a single LevelDB value (e.g., one account document) as hex bytes, redact PII (replace names, balances, IDs with placeholders), and save to `tests/fixtures/protobuf-samples/account.hex`.

- [ ] **Step 2: Write failing tests**

```typescript
// tests/localstore/protobuf.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeFirestoreDocument, FirestoreValue } from '../../src/localstore/protobuf.js';

const SAMPLES = join(import.meta.dirname, '..', 'fixtures', 'protobuf-samples');

describe('decodeFirestoreDocument', () => {
  test('decodes a redacted account sample into a fields map', () => {
    const hex = readFileSync(join(SAMPLES, 'account.hex'), 'utf8').trim();
    const bytes = Buffer.from(hex, 'hex');
    const doc = decodeFirestoreDocument(bytes);
    // Assertions depend on research doc's field inventory. Example:
    assert.ok(doc.fields);
    assert.strictEqual(typeof doc.fields.name, 'object');
  });

  test('throws CACHE_DECODE_ERROR on malformed bytes', () => {
    assert.throws(
      () => decodeFirestoreDocument(Buffer.from([0xff, 0xff, 0xff])),
      (err: Error) => (err as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('FirestoreValue.toJs converts primitives', () => {
    const v: FirestoreValue = { stringValue: 'hello' };
    assert.strictEqual(FirestoreValue.toJs(v), 'hello');
  });

  test('FirestoreValue.toJs converts integerValue to number', () => {
    assert.strictEqual(FirestoreValue.toJs({ integerValue: '42' }), 42);
  });

  test('FirestoreValue.toJs converts timestampValue to ISO string', () => {
    const iso = FirestoreValue.toJs({ timestampValue: '2026-04-17T00:00:00Z' });
    assert.strictEqual(iso, '2026-04-17T00:00:00Z');
  });

  test('FirestoreValue.toJs handles nullValue', () => {
    assert.strictEqual(FirestoreValue.toJs({ nullValue: null }), null);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="decodeFirestoreDocument"
```

Expected: FAIL.

- [ ] **Step 4: Implement**

Using `protobufjs`, load the Firestore Document proto schema (bundled in the research-identified package or inlined from `google/firestore/v1/document.proto`). Export `decodeFirestoreDocument(bytes: Uint8Array): FirestoreDocument` and a `FirestoreValue.toJs(v)` helper that maps protobuf `Value` unions to native JS. Wrap decode failures in `CopilotMoneyError('CACHE_DECODE_ERROR', ...)`.

Note: if the LevelDB values aren't raw `Document` but an internal `MaybeDocument` wrapper (research doc should confirm), decode the wrapper first and unwrap to the inner `Document`.

- [ ] **Step 5: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/localstore/protobuf.ts tests/localstore/protobuf.test.ts tests/fixtures/protobuf-samples/
git commit -m "feat(localstore): add Firestore Document protobuf decoder"
```

---

## Phase E — Per-Entity Decoders

Pattern: each decoder task follows the exact structure of Task 13. Repeat mechanically for each entity.

### Task 13: `decoders/accounts.ts`

**Files:**
- Create: `src/localstore/decoders/accounts.ts`
- Create: `tests/localstore/decoders/accounts.test.ts`
- Modify: `tests/fixtures/protobuf-samples/` (add `account.hex` if not from Task 12)

- [ ] **Step 1: Write failing test**

```typescript
// tests/localstore/decoders/accounts.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeAccount } from '../../../src/localstore/decoders/accounts.js';
import { decodeFirestoreDocument } from '../../../src/localstore/protobuf.js';

const SAMPLES = join(import.meta.dirname, '..', '..', 'fixtures', 'protobuf-samples');

describe('decodeAccount', () => {
  test('maps a decoded Firestore account doc to our Account type', () => {
    const hex = readFileSync(join(SAMPLES, 'account.hex'), 'utf8').trim();
    const doc = decodeFirestoreDocument(Buffer.from(hex, 'hex'));
    const account = decodeAccount('accounts/acct-1', doc);
    assert.strictEqual(typeof account.id, 'string');
    assert.strictEqual(typeof account.name, 'string');
    // Add assertions for every field the Account type requires per src/types/account.ts
  });

  test('throws CACHE_DECODE_ERROR if required fields missing', () => {
    const emptyDoc = { fields: {} };
    assert.throws(
      () => decodeAccount('accounts/x', emptyDoc as never),
      (err: Error) => (err as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="decodeAccount"
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/localstore/decoders/accounts.ts
import { Account } from '../../types/account.js';
import { CopilotMoneyError } from '../../types/error.js';
import { FirestoreDocument, FirestoreValue } from '../protobuf.js';

export function decodeAccount(key: string, doc: FirestoreDocument): Account {
  const id = key.split('/').pop();
  if (!id) throw new CopilotMoneyError('CACHE_DECODE_ERROR', `Bad account key: ${key}`);
  const f = doc.fields;
  const requireString = (name: string): string => {
    const v = f[name];
    if (!v) throw new CopilotMoneyError('CACHE_DECODE_ERROR', `Account ${id} missing field: ${name}`);
    const js = FirestoreValue.toJs(v);
    if (typeof js !== 'string') throw new CopilotMoneyError('CACHE_DECODE_ERROR', `Account ${id} field ${name} is not string`);
    return js;
  };
  // Fields map per src/types/account.ts. Example:
  return {
    id,
    name: requireString('name'),
    // ... remaining fields from Account type
  };
}
```

Read `src/types/account.ts` and map every field. For optional fields, guard with `f[name] ? FirestoreValue.toJs(f[name]) : undefined`.

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/localstore/decoders/accounts.ts tests/localstore/decoders/accounts.test.ts
git commit -m "feat(localstore): decode Account from Firestore doc"
```

---

### Task 14: `decoders/categories.ts`

Same shape as Task 13, with `Category` type from `src/types/category.ts`. Fixture: `categories.hex`. Commit: `feat(localstore): decode Category`.

### Task 15: `decoders/tags.ts`

Same shape. Type: `Tag` from `src/types/tag.ts`. Fixture: `tag.hex`. Commit: `feat(localstore): decode Tag`.

### Task 16: `decoders/transactions.ts`

Same shape. Type: `Transaction` from `src/types/transaction.ts`. Fixture: `transaction.hex`. Notes: transactions have nested `tagIds` and `categoryId` references and timestamp fields — map those explicitly using `FirestoreValue.toJs`. Commit: `feat(localstore): decode Transaction`.

### Task 17: `decoders/recurring.ts`

Same shape. Type: check if `Recurring` is typed; if not, add a Zod schema to `src/types/` first as part of this task. Fixture: `recurring.hex`. Commit: `feat(localstore): decode Recurring`.

### Task 18: `decoders/budgets.ts`

Same shape. Type: check if `Budget` is typed; if not, add Zod schema first. Fixture: `budget.hex`. Commit: `feat(localstore): decode Budget`.

---

## Phase F — LocalStore Facade

### Task 19: `localstore/index.ts` — facade + cache status

**Files:**
- Create: `src/localstore/index.ts`
- Create: `tests/localstore/index.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/localstore/index.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import { createLocalStore } from '../../src/localstore/index.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'leveldb-sample');

describe('LocalStore', () => {
  test('getAccounts returns decoded accounts', async () => {
    // Requires Phase E fixtures to be realistic; adapt as needed.
    const store = await createLocalStore({ path: FIXTURE });
    const accounts = await store.getAccounts();
    assert.ok(Array.isArray(accounts));
    await store.close();
  });

  test('getCacheStatus returns per-entity counts and freshness', async () => {
    const store = await createLocalStore({ path: FIXTURE });
    const status = await store.getCacheStatus();
    assert.ok(status.cacheLocation);
    assert.ok(status.entities);
    assert.ok(typeof status.entities.transactions.count === 'number');
    await store.close();
  });

  test('surfaces LOCAL_CACHE_MISSING if cache path absent', async () => {
    await assert.rejects(
      () => createLocalStore({ path: '/no/such/dir' }),
      (err: Error) => (err as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });

  test('decode errors include entity and key context', async () => {
    // Point at a fixture that contains malformed bytes for one entity.
    // Skip this test if fixtures don't cover it; otherwise assert CACHE_DECODE_ERROR.
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="LocalStore"
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/localstore/index.ts
import { openReadOnly, LevelDbReader } from './leveldb.js';
import { resolveCachePath } from './path.js';
import { decodeFirestoreDocument } from './protobuf.js';
import { decodeAccount } from './decoders/accounts.js';
import { decodeCategory } from './decoders/categories.js';
import { decodeTag } from './decoders/tags.js';
import { decodeTransaction } from './decoders/transactions.js';
import { decodeRecurring } from './decoders/recurring.js';
import { decodeBudget } from './decoders/budgets.js';
import { CopilotMoneyError } from '../types/error.js';
import type { Account } from '../types/account.js';
import type { Category } from '../types/category.js';
import type { Tag } from '../types/tag.js';
import type { Transaction } from '../types/transaction.js';

// Entity key prefixes from docs/research/2026-04-17-firestore-leveldb-format.md
const PREFIX = {
  accounts: '<real prefix>',
  categories: '<real prefix>',
  tags: '<real prefix>',
  transactions: '<real prefix>',
  recurring: '<real prefix>',
  budgets: '<real prefix>',
};

export interface LocalStore {
  getAccounts(): Promise<Account[]>;
  getCategories(): Promise<Category[]>;
  getTags(): Promise<Tag[]>;
  getTransactions(filter?: { since?: string; until?: string; categoryId?: string; tagId?: string; limit?: number }): Promise<Transaction[]>;
  getRecurring(): Promise<unknown[]>;
  getBudgets(): Promise<unknown[]>;
  getCacheStatus(): Promise<CacheStatus>;
  close(): Promise<void>;
}

export interface CacheStatus {
  cacheLocation: string;
  entities: Record<'accounts' | 'categories' | 'tags' | 'transactions' | 'recurring' | 'budgets',
    { count: number; lastUpdatedAt: string | null }>;
  totalSizeBytes: number;
}

export async function createLocalStore(deps: { path?: string } = {}): Promise<LocalStore> {
  const path = deps.path ?? (await resolveCachePath());
  const db = await openReadOnly(path);
  return {
    getAccounts: () => loadAll(db, PREFIX.accounts, decodeAccount),
    getCategories: () => loadAll(db, PREFIX.categories, decodeCategory),
    getTags: () => loadAll(db, PREFIX.tags, decodeTag),
    getTransactions: async (filter) => {
      const all = await loadAll(db, PREFIX.transactions, decodeTransaction);
      return applyTransactionFilter(all, filter);
    },
    getRecurring: () => loadAll(db, PREFIX.recurring, decodeRecurring),
    getBudgets: () => loadAll(db, PREFIX.budgets, decodeBudget),
    getCacheStatus: () => getCacheStatus(db, path),
    close: () => db.close(),
  };
}

async function loadAll<T>(db: LevelDbReader, prefix: string, decode: (key: string, doc: ReturnType<typeof decodeFirestoreDocument>) => T): Promise<T[]> {
  const out: T[] = [];
  for await (const key of db.keysWithPrefix(prefix)) {
    const bytes = await db.get(key);
    if (!bytes) continue;
    const doc = decodeFirestoreDocument(bytes);
    out.push(decode(key, doc));
  }
  return out;
}

function applyTransactionFilter(txns: Transaction[], filter?: Parameters<LocalStore['getTransactions']>[0]): Transaction[] {
  if (!filter) return txns.slice(0, 200);
  let filtered = txns;
  if (filter.since) filtered = filtered.filter(/* compare date */);
  if (filter.until) filtered = filtered.filter(/* compare date */);
  if (filter.categoryId) filtered = filtered.filter((t) => t.categoryId === filter.categoryId);
  if (filter.tagId) filtered = filtered.filter((t) => t.tagIds?.includes(filter.tagId!));
  return filtered.slice(0, filter.limit ?? 200);
}

async function getCacheStatus(db: LevelDbReader, path: string): Promise<CacheStatus> {
  // Walk each entity prefix, count keys, find max cacheUpdatedAt.
  // totalSizeBytes: du-s the path via fs.stat recursively.
  // Implementation details omitted here; test drives shape.
}
```

Fill in the real prefixes from the research doc. Implement `applyTransactionFilter` with real date comparisons. Implement `getCacheStatus` with directory size calculation (via `fs.readdir` + `fs.stat`).

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/localstore/index.ts tests/localstore/index.test.ts
git commit -m "feat(localstore): LocalStore facade with cache status"
```

---

## Phase G — Migrate Read Tools

Pattern: each tool task follows Task 20. Repeat mechanically.

### Task 20: Migrate `get_accounts` to LocalStore

**Files:**
- Modify: `src/tools/accounts.ts`
- Modify: `tests/tools/accounts.test.ts`
- Modify: `src/tools/index.ts` (dependency wiring)

- [ ] **Step 1: Read current `src/tools/accounts.ts` and its test.**

- [ ] **Step 2: Rewrite test to inject LocalStore instead of GraphQLClient**

```typescript
// tests/tools/accounts.test.ts — replace GraphQL mock with LocalStore mock
import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { handleGetAccounts } from '../../src/tools/accounts.js';

describe('get_accounts tool', () => {
  test('returns accounts from LocalStore', async () => {
    const localStore = {
      getAccounts: mock.fn(async () => [{ id: 'a1', name: 'Checking' /*, other required fields */ }]),
    };
    const result = await handleGetAccounts({}, { localStore });
    assert.ok(Array.isArray(result.content));
    // Adapt to existing formatResult shape
  });

  test('surfaces LOCAL_CACHE_MISSING', async () => {
    const localStore = {
      getAccounts: mock.fn(async () => {
        throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'x');
      }),
    };
    const result = await handleGetAccounts({}, { localStore });
    // Assert result is an MCP error response with LOCAL_CACHE_MISSING code
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- --test-name-pattern="get_accounts"
```

Expected: FAIL.

- [ ] **Step 4: Update the tool handler to accept LocalStore**

```typescript
// src/tools/accounts.ts — replace GraphQLClient dep with LocalStore
import { LocalStore } from '../localstore/index.js';
import { formatResult, formatError } from './format.js'; // adapt to real helper path
import { CopilotMoneyError } from '../types/error.js';

export interface GetAccountsDeps { localStore: LocalStore; }

export async function handleGetAccounts(_input: Record<string, never>, deps: GetAccountsDeps) {
  try {
    const accounts = await deps.localStore.getAccounts();
    return formatResult({
      accounts,
      meta: { entityType: 'accounts', cacheUpdatedAt: /* from getCacheStatus */ null },
    });
  } catch (err) {
    return formatError(err instanceof CopilotMoneyError ? err : new CopilotMoneyError('GRAPHQL_ERROR', (err as Error).message));
  }
}
```

- [ ] **Step 5: Update `src/tools/index.ts` to pass `LocalStore` into the handler**

The existing `registerTools()` wires up dependencies. Add `localStore` alongside the existing `graphqlClient` (keep graphqlClient — writes still need it). Don't remove GraphQL wiring yet; writes still need it.

- [ ] **Step 6: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/tools/accounts.ts src/tools/index.ts tests/tools/accounts.test.ts
git commit -m "refactor(tools): get_accounts reads from LocalStore"
```

---

### Task 21: Migrate `get_categories` to LocalStore

Same shape as Task 20, for `src/tools/categories.ts`. Commit: `refactor(tools): get_categories reads from LocalStore`.

### Task 22: Migrate `get_tags` to LocalStore

Same shape. Commit: `refactor(tools): get_tags reads from LocalStore`.

### Task 23: Migrate `get_transactions` to LocalStore

Same shape, **but** transaction filtering must run in-memory (no more GraphQL query filtering). Tests must verify `since`, `until`, `categoryId`, `tagId`, and `limit` filters. Commit: `refactor(tools): get_transactions reads from LocalStore`.

### Task 24: Migrate `get_recurring` to LocalStore

Same shape. Commit: `refactor(tools): get_recurring reads from LocalStore`.

### Task 25: Migrate `get_budgets` to LocalStore

Same shape. Commit: `refactor(tools): get_budgets reads from LocalStore`.

---

### Task 26: Add `get_cache_status` tool

**Files:**
- Create: `src/tools/cache_status.ts`
- Create: `tests/tools/cache_status.test.ts`
- Modify: `src/tools/index.ts` (register new tool)

- [ ] **Step 1: Write failing test**

```typescript
// tests/tools/cache_status.test.ts
import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { handleGetCacheStatus } from '../../src/tools/cache_status.js';

describe('get_cache_status tool', () => {
  test('returns cache metadata', async () => {
    const localStore = {
      getCacheStatus: mock.fn(async () => ({
        cacheLocation: '/path',
        entities: { accounts: { count: 3, lastUpdatedAt: '2026-04-17T00:00:00Z' } /* ... */ },
        totalSizeBytes: 1024,
      })),
    };
    const result = await handleGetCacheStatus({}, { localStore });
    // Assert result contains cacheLocation, entities, totalSizeBytes
  });

  test('surfaces LOCAL_CACHE_MISSING', async () => {
    const localStore = {
      getCacheStatus: mock.fn(async () => { throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'x'); }),
    };
    const result = await handleGetCacheStatus({}, { localStore });
    // Assert error-shaped response
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run pattern: `npm test -- --test-name-pattern="get_cache_status"`. Expected: FAIL.

- [ ] **Step 3: Implement handler**

```typescript
// src/tools/cache_status.ts
import { LocalStore } from '../localstore/index.js';
import { CopilotMoneyError } from '../types/error.js';

export async function handleGetCacheStatus(_input: Record<string, never>, deps: { localStore: LocalStore }) {
  try {
    const status = await deps.localStore.getCacheStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  } catch (err) {
    return formatError(err instanceof CopilotMoneyError ? err : new CopilotMoneyError('GRAPHQL_ERROR', (err as Error).message));
  }
}
```

- [ ] **Step 4: Register in `src/tools/index.ts`**

Add the tool with Zod schema `{}` (no input), name `get_cache_status`, description matching the spec.

- [ ] **Step 5: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/tools/cache_status.ts tests/tools/cache_status.test.ts src/tools/index.ts
git commit -m "feat(tools): add get_cache_status"
```

---

## Phase H — Write Tool Error Path Polish

### Task 27: Update write tools to surface improved TOKEN_EXPIRED message

**Files:**
- Modify: `src/tools/categorize.ts`
- Modify: `src/tools/review.ts`
- Modify: `src/tools/tag.ts`
- Modify: `src/tools/bulk.ts`
- Modify: `src/tools/suggest.ts`
- Modify: corresponding `tests/tools/*.test.ts`

- [ ] **Step 1: Write failing tests asserting the new TOKEN_EXPIRED message**

For each write tool's test file, add a test that mocks `GraphQLClient` to surface a `CopilotMoneyError('TOKEN_EXPIRED', ...)` and asserts the returned MCP error message contains "Run `copilot-auth login`".

```typescript
// Example pattern in tests/tools/categorize.test.ts
test('TOKEN_EXPIRED message tells user to run copilot-auth login', async () => {
  const graphqlClient = {
    mutate: mock.fn(async () => {
      throw new CopilotMoneyError('TOKEN_EXPIRED', 'Authentication expired. Run `copilot-auth login` in your terminal, then retry.');
    }),
  };
  const result = await handleCategorizeTransaction({ id: 'x', categoryId: 'y' }, { graphqlClient, localStore });
  assert.ok(JSON.stringify(result).includes('copilot-auth login'));
});
```

- [ ] **Step 2: Run tests to verify failure**

Expected: they may already pass if AuthManager already throws this message; the point is to assert the message format is stable.

- [ ] **Step 3: Ensure AuthManager is the source of the message**

The message now lives in `AuthManager.getToken()` (Task 8). Each write tool that calls `authManager.getToken()` before `graphqlClient.mutate()` will naturally surface it. Verify each write tool does so — fix any that don't.

For `suggest_categories`: it reads categories (previously GraphQL) and applies heuristics. Migrate its read to `LocalStore.getCategories()`. This removes its need to hit GraphQL for reads, though it still performs writes internally if we have any suggest-and-apply flows — check before editing.

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/ tests/tools/
git commit -m "refactor(tools): write tools surface actionable TOKEN_EXPIRED message"
```

---

## Phase I — Delete Dead Code

### Task 28: Delete daemon, socket, Playwright, and queries.ts

**Files:**
- Delete: `src/auth/daemon.ts`
- Delete: `src/auth/socket.ts`
- Delete: `src/auth/playwright.ts`
- Delete: `src/graphql/queries.ts`
- Delete: `tests/auth/daemon.test.ts.skip`
- Delete: `tests/auth/socket.test.ts.skip`
- Delete: `tests/auth/playwright.test.ts.skip`
- Modify: `src/auth/index.ts` (remove exports for deleted modules)
- Modify: `src/graphql/fragments.ts` (delete if only used by queries; otherwise keep)
- Modify: `src/server.ts` (drop daemon wiring)
- Modify: `package.json` (remove `playwright` from optionalDependencies)

- [ ] **Step 1: Grep for remaining imports of the to-be-deleted modules**

```bash
grep -rn "from.*auth/daemon\|from.*auth/socket\|from.*auth/playwright\|from.*graphql/queries" src/ tests/ 2>&1
```

Expected: no matches (all call sites should already be gone from Task 9 / Task 20–25). If matches exist, resolve them before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/auth/daemon.ts src/auth/socket.ts src/auth/playwright.ts
git rm src/graphql/queries.ts
git rm tests/auth/daemon.test.ts.skip tests/auth/socket.test.ts.skip tests/auth/playwright.test.ts.skip
```

If `src/graphql/fragments.ts` is only imported from the now-deleted queries, delete it too. Otherwise keep it.

- [ ] **Step 3: Update `src/auth/index.ts`**

Remove exports referencing deleted modules.

- [ ] **Step 4: Update `src/server.ts`**

Remove daemon-start calls, socket-setup, Playwright imports. Keep AuthManager + keychain + GraphQLClient + LocalStore wiring.

- [ ] **Step 5: Remove `playwright` from `package.json`**

```bash
npm uninstall playwright
```

- [ ] **Step 6: Run full quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green. If build breaks, fix the referenced file in the same commit.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove daemon, socket, playwright, and GraphQL queries"
```

---

### Task 29: Remove daemon subcommand from CLI help and cleanup

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`

- [ ] **Step 1: Grep `src/cli.ts` for any remaining `daemon` references**

```bash
grep -n "daemon" src/cli.ts
```

Expected: no matches. If any, delete and update help text.

- [ ] **Step 2: Verify `copilot-auth --help` only lists `login`, `logout`, `status`**

Build and run:

```bash
npm run build && node dist/cli.js --help
```

Expected: help text shows only the three supported commands.

- [ ] **Step 3: Add a CLI help-text test**

```typescript
// tests/cli.test.ts — addition
test('help text lists only login, logout, status', async () => {
  // Invoke the main dispatcher with --help and a print sink; assert output
});
```

- [ ] **Step 4: Run tests and quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "chore(cli): drop daemon subcommand, clean help text"
```

---

### Task 30: Remove 5-minute TTL cache and any remaining dead code

**Files:**
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Remove `categoryCache` / `tagCache` TTL logic in `src/tools/index.ts`**

Reads are local now — the cache is redundant. Delete the cache code; the tool handlers call `LocalStore` directly.

- [ ] **Step 2: Run quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/tools/index.ts
git commit -m "chore(tools): remove 5-minute read-through cache (reads are local)"
```

---

## Phase J — Documentation and Release

### Task 31: Update CLAUDE.md and README

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update `CLAUDE.md` — replace the "Auth Stack" and "Entry Points" sections**

Current CLAUDE.md describes a 4-layer auth stack with daemon. Replace with the new architecture:

```markdown
### Entry Points
- `src/server.ts` — MCP server. Creates LocalStore + AuthManager + GraphQLClient → registers tools → StdioServerTransport.
- `src/cli.ts` — Auth CLI (`copilot-auth login|logout|status`). Magic-link-paste flow, no daemon.

### Auth (keychain-only)
- `auth/keychain.ts` — Stores `{ token, refreshToken, email, expiresAt }` in macOS Keychain (service `copilot-money-auth`, account `token`).
- `auth/manager.ts` — Thin wrapper: `getToken()` returns the ID token if still valid (60s buffer); otherwise throws `TOKEN_EXPIRED`.
- `auth/firebaseRest.ts` — Direct REST calls to `identitytoolkit.googleapis.com` for `sendOobCode` / `signInWithEmailLink`. No browser.

### LocalStore
- `localstore/path.ts` — Resolves `~/Library/Containers/com.copilot.production/.../main`; throws `LOCAL_CACHE_MISSING` if absent.
- `localstore/leveldb.ts` — Read-only iterator over Copilot's Firestore LevelDB cache.
- `localstore/protobuf.ts` — Decodes Firestore `Document` protos.
- `localstore/decoders/*.ts` — Per-entity mappers from Firestore docs to our Zod types.

### Read vs. write backends
- **Reads:** `LocalStore` parses the Mac app's Firestore cache. No auth. No network.
- **Writes:** GraphQL mutations with `Authorization: Bearer <idToken>`. On expired token, tools return `TOKEN_EXPIRED` pointing at `copilot-auth login`.
```

Delete references to daemon, Unix socket, Playwright.

- [ ] **Step 2: Update `README.md`**

- Remove installation steps involving Playwright and password.
- Add "Install the Copilot Money Mac app and open it once" as a prerequisite for reads.
- Update Quick Start to describe `copilot-auth login` (magic-link flow).
- Remove daemon instructions.
- Add a note about ~60 min token lifetime for writes.

- [ ] **Step 3: Run quality gates**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update for local cache + magic-link architecture"
```

---

### Task 32: End-to-end smoke test and version bump

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Build**

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

- [ ] **Step 2: Manual smoke — login**

The user (not the agent) runs:

```bash
node dist/cli.js login
```

Follow the prompts: enter email → receive magic link in email → paste → expect "Logged in as <email>." **If this fails with App Check, it's the 24h throttle from earlier in this debugging session — wait it out and retry.** Agent should pause and hand off to user for this step; do not continue until user confirms success.

- [ ] **Step 3: Manual smoke — read**

```bash
# From inside a quick script or an MCP client (Claude Code MCP config)
# Invoke get_accounts tool → expect a list of accounts from LocalStore
```

User confirms real data comes back. If the app hasn't been opened recently, expect `LOCAL_CACHE_MISSING` — open the app once, retry.

- [ ] **Step 4: Manual smoke — write**

```bash
# Invoke categorize_transaction with a known tx id and category
```

User confirms the write succeeded (idempotent, safe) and that Copilot web app shows the change.

- [ ] **Step 5: Bump version to 3.0.0 and commit**

```bash
npm version major --no-git-tag-version
```

This is a breaking change: reads now require the Mac app.

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 3.0.0 (breaking: reads require Mac app)"
```

- [ ] **Step 6: Push branch and open PR**

```bash
git push -u origin dakaneye/local-cache-rewrite
gh pr create --title "Local cache reads + magic-link login" --body "$(cat <<'EOF'
## Summary
- Replace Playwright password auto-refresh with Firebase REST magic-link login (no browser)
- Read tools switch to local Firestore cache parsing (LevelDB + protobuf)
- Delete daemon, socket, Playwright
- Add get_cache_status tool; all read responses include `meta.cacheUpdatedAt`
- BREAKING: reads require the Copilot Money Mac app to have been opened

## Test plan
- [ ] `npm run build && npm run lint && npm test` green
- [ ] `/review-code` grade A on the branch
- [ ] Manual: `copilot-auth login` succeeds via magic link
- [ ] Manual: `get_accounts` returns real data
- [ ] Manual: `categorize_transaction` writes successfully

Spec: `docs/specs/2026-04-17-local-cache-rewrite-design.md`
Plan: `docs/plans/2026-04-17-local-cache-rewrite.md`
EOF
)"
```

Expected: PR URL. User reviews before merge.

---

## Self-Review Checklist

Spec coverage mapping (spec section → plan task):
- Architecture diagram → Task 28+ (wiring lands in place after Phase I)
- Components → Tasks 4–19 (each new module), Tasks 20–26 (handlers), Task 28 (deletions)
- Data flow (read/write/login/cache-missing) → Tasks 19, 20–26, 27, 9
- Error taxonomy → Task 3 (all new codes)
- Cache staleness (get_cache_status + meta field) → Tasks 19, 20–26 (meta), 26 (tool)
- Tool surface Phase 1 (7 reads + 9 writes) → Tasks 20–26 (reads), 27 (writes)
- Quality gates → Every task's Step 4/5
- Testing strategy → Every task's Step 1 (TDD test-first)
- Migration (password cleanup) → Task 7 (clearCredentials deletes password entry)
- Risks #1 (App Check on REST) → Task 32 manual smoke; fallback is a future follow-up, not this plan
- Risks #2 (LevelDB format drift) → Tasks 12, 13–18 (defensive decoders)
- Risks #3 (lock contention) → Task 11 (LOCAL_CACHE_LOCKED)
- Risks #4 (2FA) → Not in plan; manual smoke (Task 32) surfaces it if enabled; if hit, spawn a follow-up issue
- Risks #5 (Phase 2 scope) → Phase 2 excluded explicitly
- Risks #6 (refresh-token experiment deferred) → Task 7 captures `refreshToken`; no usage

Placeholder scan: no "TBD" / "implement later" slots. Research placeholders (`<real prefix>`, `<actual package>`) are bounded by Task 1's output.

Type consistency: `idToken`/`expiresAt`/`email`/`refreshToken` used consistently across Tasks 6, 7, 8, 9. `LocalStore` interface defined in Task 19 and consumed identically in Tasks 20–27.

Gaps identified during self-review: none blocking. The `get_cache_status` call within read tools to populate `meta.cacheUpdatedAt` needs a helper — add it to `LocalStore` interface in Task 19 if not already, or have each handler call `getCacheStatus()` once. Test files for migrated read tools (Tasks 20–25) should assert the `meta` field is present.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-04-17-local-cache-rewrite.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session, batched with checkpoints for review

**Which approach?**
