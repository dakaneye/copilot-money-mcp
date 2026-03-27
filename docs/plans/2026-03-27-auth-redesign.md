# Auth Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unified auth system with daemon-based token refresh, eliminating popup/email-link friction.

**Architecture:** Auth daemon maintains valid tokens via headless Playwright refresh, serves them to clients via Unix socket. CLI handles user-facing auth commands. MCP server is simplified to server-only.

**Tech Stack:** Node.js 20+, TypeScript, Playwright, keytar, Unix sockets

---

## File Structure

```
src/
├── server.ts              # MCP server entry (bin: copilot-money-mcp) - NEW
├── cli.ts                 # Auth CLI entry (bin: copilot-auth) - NEW
├── auth/
│   ├── keychain.ts        # MODIFY: add credentials storage
│   ├── playwright.ts      # REWRITE: password-based login
│   ├── socket.ts          # NEW: Unix socket server/client
│   ├── daemon.ts          # NEW: Token refresh daemon
│   ├── manager.ts         # MODIFY: use socket client
│   ├── index.ts           # MODIFY: exports
│   └── email-link.ts      # DELETE in Phase 3
├── graphql/               # Unchanged
└── tools/                 # Unchanged

tests/auth/
├── keychain.test.ts       # MODIFY: test credentials
├── socket.test.ts         # NEW
├── daemon.test.ts         # NEW
└── manager.test.ts        # MODIFY: test socket client
```

---

## Phase 1: Auth Infrastructure

### Task 1: Extend Keychain for Credentials Storage

**Files:**
- Modify: `src/auth/keychain.ts`
- Test: `tests/auth/keychain.test.ts`

- [ ] **Step 1: Write failing test for credentials storage**

```typescript
// tests/auth/keychain.test.ts - add to existing file
import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('credentials storage', () => {
  test('storeCredentials saves email and password', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const { storeCredentials, getCredentials } = await createKeychainWithMock(mockKeytar);

    await storeCredentials({ email: 'test@example.com', password: 'secret123' });

    assert.strictEqual(mockKeytar.setPassword.mock.calls.length, 1);
    const [service, account, value] = mockKeytar.setPassword.mock.calls[0].arguments;
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'credentials');
    const parsed = JSON.parse(value);
    assert.strictEqual(parsed.email, 'test@example.com');
    assert.strictEqual(parsed.password, 'secret123');
  });

  test('getCredentials returns stored credentials', async () => {
    const storedValue = JSON.stringify({ email: 'test@example.com', password: 'secret123' });
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn((service: string, account: string) => {
        if (account === 'credentials') return Promise.resolve(storedValue);
        return Promise.resolve(null);
      }),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const { getCredentials } = await createKeychainWithMock(mockKeytar);
    const result = await getCredentials();

    assert.deepStrictEqual(result, { email: 'test@example.com', password: 'secret123' });
  });

  test('getCredentials returns null when not stored', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const { getCredentials } = await createKeychainWithMock(mockKeytar);
    const result = await getCredentials();

    assert.strictEqual(result, null);
  });

  test('clearCredentials removes stored credentials', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const { clearCredentials } = await createKeychainWithMock(mockKeytar);
    await clearCredentials();

    assert.strictEqual(mockKeytar.deletePassword.mock.calls.length, 1);
    const [service, account] = mockKeytar.deletePassword.mock.calls[0].arguments;
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'credentials');
  });
});

// Helper to inject mock keytar
async function createKeychainWithMock(mockKeytar: any) {
  // This will be implemented to allow dependency injection
  const mod = await import('../../dist/auth/keychain.js');
  return mod.createKeychain(mockKeytar);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with "createKeychain is not a function" or similar

- [ ] **Step 3: Implement credentials storage**

```typescript
// src/auth/keychain.ts - replace entire file
import keytar from 'keytar';

const SERVICE_NAME = 'copilot-money-auth';
const ACCOUNT_TOKEN = 'token';
const ACCOUNT_CREDENTIALS = 'credentials';

export interface StoredToken {
  token: string;
  expiresAt: number;
}

export interface StoredCredentials {
  email: string;
  password: string;
}

export interface KeychainDeps {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
}

const defaultDeps: KeychainDeps = {
  setPassword: keytar.setPassword.bind(keytar),
  getPassword: keytar.getPassword.bind(keytar),
  deletePassword: keytar.deletePassword.bind(keytar),
};

export function createKeychain(deps: KeychainDeps = defaultDeps) {
  async function storeToken(token: StoredToken): Promise<void> {
    const value = JSON.stringify(token);
    await deps.setPassword(SERVICE_NAME, ACCOUNT_TOKEN, value);
  }

  async function getToken(): Promise<StoredToken | null> {
    const value = await deps.getPassword(SERVICE_NAME, ACCOUNT_TOKEN);
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredToken;
    } catch {
      return null;
    }
  }

  async function clearToken(): Promise<void> {
    try {
      await deps.deletePassword(SERVICE_NAME, ACCOUNT_TOKEN);
    } catch {
      // Ignore errors - may not exist
    }
  }

  async function storeCredentials(creds: StoredCredentials): Promise<void> {
    const value = JSON.stringify(creds);
    await deps.setPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS, value);
  }

  async function getCredentials(): Promise<StoredCredentials | null> {
    const value = await deps.getPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredCredentials;
    } catch {
      return null;
    }
  }

  async function clearCredentials(): Promise<void> {
    try {
      await deps.deletePassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
    } catch {
      // Ignore errors - may not exist
    }
  }

  async function clearAll(): Promise<void> {
    await Promise.all([clearToken(), clearCredentials()]);
  }

  function isTokenExpired(token: StoredToken): boolean {
    const BUFFER_MS = 10 * 60 * 1000; // 10 minutes before expiry
    return Date.now() > token.expiresAt - BUFFER_MS;
  }

  return {
    storeToken,
    getToken,
    clearToken,
    storeCredentials,
    getCredentials,
    clearCredentials,
    clearAll,
    isTokenExpired,
  };
}

// Default instance for convenience
const defaultKeychain = createKeychain();

export const storeToken = defaultKeychain.storeToken;
export const getToken = defaultKeychain.getToken;
export const clearToken = defaultKeychain.clearToken;
export const storeCredentials = defaultKeychain.storeCredentials;
export const getCredentials = defaultKeychain.getCredentials;
export const clearCredentials = defaultKeychain.clearCredentials;
export const clearAll = defaultKeychain.clearAll;
export const isTokenExpired = defaultKeychain.isTokenExpired;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/keychain.ts tests/auth/keychain.test.ts
git commit -m "feat(auth): add credentials storage to keychain"
```

---

### Task 2: Create Unix Socket Module

**Files:**
- Create: `src/auth/socket.ts`
- Create: `tests/auth/socket.test.ts`

- [ ] **Step 1: Write failing test for socket client**

```typescript
// tests/auth/socket.test.ts
import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:net';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('SocketClient', () => {
  const testSocketPath = join(tmpdir(), `test-socket-${process.pid}.sock`);
  let server: ReturnType<typeof createServer> | null = null;

  afterEach(async () => {
    if (server) {
      server.close();
      server = null;
    }
    try {
      await unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  test('getToken returns token from daemon', async () => {
    // Set up mock server
    server = createServer((socket) => {
      socket.on('data', (data) => {
        const request = JSON.parse(data.toString());
        if (request.method === 'GET' && request.path === '/token') {
          socket.write(JSON.stringify({
            token: 'test-token-123',
            expiresAt: '2026-03-27T18:00:00.000Z',
          }));
          socket.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      server!.listen(testSocketPath, resolve);
    });

    const { SocketClient } = await import('../../dist/auth/socket.js');
    const client = new SocketClient(testSocketPath);
    const result = await client.getToken();

    assert.strictEqual(result.token, 'test-token-123');
    assert.strictEqual(result.expiresAt, '2026-03-27T18:00:00.000Z');
  });

  test('getToken throws when daemon not running', async () => {
    const { SocketClient } = await import('../../dist/auth/socket.js');
    const client = new SocketClient('/nonexistent/socket.sock');

    await assert.rejects(
      () => client.getToken(),
      /daemon not running/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with "Cannot find module '../src/auth/socket.js'"

- [ ] **Step 3: Implement socket client**

```typescript
// src/auth/socket.ts
import { connect, createServer, Server, Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmod, unlink } from 'node:fs/promises';

export const DEFAULT_SOCKET_PATH = join(homedir(), '.copilot-auth.sock');

export interface TokenResponse {
  token: string;
  expiresAt: string;
}

export interface StatusResponse {
  authenticated: boolean;
  email: string | null;
  expiresAt: string | null;
}

export interface RefreshResponse {
  success: boolean;
  expiresAt: string | null;
  error?: string;
}

export interface SocketRequest {
  method: 'GET' | 'POST';
  path: '/token' | '/status' | '/refresh';
}

export class SocketClient {
  constructor(private socketPath: string = DEFAULT_SOCKET_PATH) {}

  private async request<T>(req: SocketRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath);
      let data = '';

      socket.on('connect', () => {
        socket.write(JSON.stringify(req));
      });

      socket.on('data', (chunk) => {
        data += chunk.toString();
      });

      socket.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response as T);
          }
        } catch (e) {
          reject(new Error(`Invalid response from daemon: ${data}`));
        }
      });

      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
          reject(new Error('Auth daemon not running. Run `copilot-auth login` first.'));
        } else {
          reject(err);
        }
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Daemon request timed out'));
      });
    });
  }

  async getToken(): Promise<TokenResponse> {
    return this.request<TokenResponse>({ method: 'GET', path: '/token' });
  }

  async getStatus(): Promise<StatusResponse> {
    return this.request<StatusResponse>({ method: 'GET', path: '/status' });
  }

  async refresh(): Promise<RefreshResponse> {
    return this.request<RefreshResponse>({ method: 'POST', path: '/refresh' });
  }

  async isRunning(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}

export type RequestHandler = (req: SocketRequest) => Promise<object>;

export class SocketServer {
  private server: Server | null = null;

  constructor(
    private socketPath: string = DEFAULT_SOCKET_PATH,
    private handler: RequestHandler
  ) {}

  async start(): Promise<void> {
    // Remove stale socket file
    try {
      await unlink(this.socketPath);
    } catch {
      // Ignore - may not exist
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        let data = '';

        socket.on('data', (chunk) => {
          data += chunk.toString();
        });

        socket.on('end', async () => {
          try {
            const request = JSON.parse(data) as SocketRequest;
            const response = await this.handler(request);
            socket.write(JSON.stringify(response));
          } catch (err) {
            socket.write(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }));
          }
          socket.end();
        });

        socket.on('error', () => {
          // Client disconnected, ignore
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.socketPath, async () => {
        // Set socket permissions to owner-only (0600)
        await chmod(this.socketPath, 0o600);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      try {
        await unlink(this.socketPath);
      } catch {
        // Ignore
      }
      this.server = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/socket.ts tests/auth/socket.test.ts
git commit -m "feat(auth): add Unix socket client and server"
```

---

### Task 3: Rewrite Playwright for Password-Based Login

**Files:**
- Modify: `src/auth/playwright.ts`

- [ ] **Step 1: Rewrite playwright module**

```typescript
// src/auth/playwright.ts - replace entire file
const COPILOT_URL = 'https://app.copilot.money';
const GRAPHQL_URL = 'https://app.copilot.money/api/graphql';

export interface LoginResult {
  token: string;
  expiresAt: number;
  email: string;
  password: string;
}

function parseJwtExpiry(token: string): number {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  if (!payload.exp) {
    throw new Error('JWT missing exp claim');
  }
  return payload.exp * 1000;
}

export async function isPlaywrightAvailable(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

/**
 * Interactive login - user enters credentials in browser.
 * Used for initial setup when we don't have credentials yet.
 */
export async function interactiveLogin(): Promise<LoginResult> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let capturedToken: string | null = null;
  let capturedEmail: string | null = null;
  let capturedPassword: string | null = null;

  // Intercept GraphQL requests to capture token
  page.on('request', (request) => {
    if (request.url().startsWith(GRAPHQL_URL) && !capturedToken) {
      const authHeader = request.headers()['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        capturedToken = authHeader.slice(7);
      }
    }
  });

  try {
    console.log('Opening browser for Copilot Money login...');
    console.log('Please enter your email and password in the browser.\n');

    await page.goto(COPILOT_URL);
    await page.waitForLoadState('networkidle');

    // Click "Continue with email"
    await page.locator('button:has-text("Continue with email")').click();
    await page.waitForTimeout(1000);

    // Wait for user to enter email
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    await emailInput.waitFor({ state: 'visible' });

    // Wait for Continue button click (user will fill email and click)
    await page.waitForURL(/.*/, { timeout: 120000 });

    // Try to click "Sign in with password instead" if visible
    const passwordInsteadButton = page.locator('button:has-text("Sign in with password instead")');
    try {
      await passwordInsteadButton.waitFor({ state: 'visible', timeout: 5000 });
      await passwordInsteadButton.click();
      await page.waitForTimeout(1000);
    } catch {
      // Button may not be visible, user might already be on password screen
    }

    // Wait for login to complete (token captured)
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    while (!capturedToken && Date.now() - startTime < timeout) {
      await page.waitForTimeout(1000);

      // Try to capture email from visible input
      if (!capturedEmail) {
        try {
          const emailValue = await emailInput.inputValue();
          if (emailValue && emailValue.includes('@')) {
            capturedEmail = emailValue;
          }
        } catch {
          // Input may no longer be visible
        }
      }

      // Try to capture password
      if (!capturedPassword) {
        try {
          const pwInput = page.locator('input[type="password"]').first();
          const pwValue = await pwInput.inputValue();
          if (pwValue) {
            capturedPassword = pwValue;
          }
        } catch {
          // Password input may not be visible yet
        }
      }
    }

    if (!capturedToken) {
      throw new Error('Login timed out after 5 minutes');
    }

    if (!capturedEmail || !capturedPassword) {
      throw new Error('Could not capture credentials from form');
    }

    const expiresAt = parseJwtExpiry(capturedToken);

    return {
      token: capturedToken,
      expiresAt,
      email: capturedEmail,
      password: capturedPassword,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Automated login - uses stored credentials.
 * Used for token refresh when we already have credentials.
 */
export async function automatedLogin(email: string, password: string): Promise<{ token: string; expiresAt: number }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let capturedToken: string | null = null;

  page.on('request', (request) => {
    if (request.url().startsWith(GRAPHQL_URL) && !capturedToken) {
      const authHeader = request.headers()['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        capturedToken = authHeader.slice(7);
      }
    }
  });

  try {
    await page.goto(COPILOT_URL);
    await page.waitForLoadState('networkidle');

    // Click "Continue with email"
    await page.locator('button:has-text("Continue with email")').click();
    await page.waitForTimeout(1000);

    // Enter email
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    await emailInput.fill(email);
    await page.locator('button[type="submit"], button:has-text("Continue")').first().click();
    await page.waitForTimeout(2000);

    // Click "Sign in with password instead"
    const passwordInsteadButton = page.locator('button:has-text("Sign in with password instead")');
    await passwordInsteadButton.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInsteadButton.click();
    await page.waitForTimeout(1000);

    // Enter password - use type() for special characters
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.click();
    await passwordInput.type(password, { delay: 50 });
    await page.waitForTimeout(500);

    // Click Continue
    await page.locator('button:has-text("Continue")').click();

    // Wait for token capture
    const startTime = Date.now();
    const timeout = 60 * 1000; // 1 minute for automated login

    while (!capturedToken && Date.now() - startTime < timeout) {
      await page.waitForTimeout(500);
    }

    if (!capturedToken) {
      throw new Error('Automated login timed out');
    }

    const expiresAt = parseJwtExpiry(capturedToken);

    return { token: capturedToken, expiresAt };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Run build to verify compilation**

```bash
npm run build
```

Expected: PASS (compiles without errors)

- [ ] **Step 3: Commit**

```bash
git add src/auth/playwright.ts
git commit -m "feat(auth): rewrite playwright for password-based login"
```

---

### Task 4: Create Auth Daemon

**Files:**
- Create: `src/auth/daemon.ts`
- Create: `tests/auth/daemon.test.ts`

- [ ] **Step 1: Write failing test for daemon**

```typescript
// tests/auth/daemon.test.ts
import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('AuthDaemon', () => {
  test('refreshIfNeeded does nothing when token is fresh', async () => {
    const mockKeychain = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'valid-token',
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes from now
      })),
      storeToken: mock.fn(() => Promise.resolve()),
      getCredentials: mock.fn(() => Promise.resolve({ email: 'test@test.com', password: 'pass' })),
    };

    const mockPlaywright = {
      automatedLogin: mock.fn(() => Promise.resolve({ token: 'new-token', expiresAt: Date.now() + 60 * 60 * 1000 })),
    };

    const { createDaemon } = await import('../../dist/auth/daemon.js');
    const daemon = createDaemon({ keychain: mockKeychain, playwright: mockPlaywright });

    await daemon.refreshIfNeeded();

    // Should not have called automatedLogin since token is fresh
    assert.strictEqual(mockPlaywright.automatedLogin.mock.calls.length, 0);
  });

  test('refreshIfNeeded refreshes when token is expiring soon', async () => {
    const mockKeychain = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'expiring-token',
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes from now (within 10 min buffer)
      })),
      storeToken: mock.fn(() => Promise.resolve()),
      getCredentials: mock.fn(() => Promise.resolve({ email: 'test@test.com', password: 'pass' })),
    };

    const mockPlaywright = {
      automatedLogin: mock.fn(() => Promise.resolve({
        token: 'new-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
      })),
    };

    const { createDaemon } = await import('../../dist/auth/daemon.js');
    const daemon = createDaemon({ keychain: mockKeychain, playwright: mockPlaywright });

    await daemon.refreshIfNeeded();

    // Should have refreshed
    assert.strictEqual(mockPlaywright.automatedLogin.mock.calls.length, 1);
    assert.strictEqual(mockKeychain.storeToken.mock.calls.length, 1);
  });

  test('handleRequest returns token for GET /token', async () => {
    const mockKeychain = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'test-token',
        expiresAt: Date.now() + 30 * 60 * 1000,
      })),
      storeToken: mock.fn(() => Promise.resolve()),
      getCredentials: mock.fn(() => Promise.resolve({ email: 'test@test.com', password: 'pass' })),
    };

    const { createDaemon } = await import('../../dist/auth/daemon.js');
    const daemon = createDaemon({ keychain: mockKeychain });

    const response = await daemon.handleRequest({ method: 'GET', path: '/token' });

    assert.strictEqual(response.token, 'test-token');
    assert.ok(response.expiresAt);
  });

  test('handleRequest returns error when no token', async () => {
    const mockKeychain = {
      getToken: mock.fn(() => Promise.resolve(null)),
      storeToken: mock.fn(() => Promise.resolve()),
      getCredentials: mock.fn(() => Promise.resolve(null)),
    };

    const { createDaemon } = await import('../../dist/auth/daemon.js');
    const daemon = createDaemon({ keychain: mockKeychain });

    const response = await daemon.handleRequest({ method: 'GET', path: '/token' });

    assert.ok(response.error);
    assert.match(response.error, /not authenticated/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with "Cannot find module '../src/auth/daemon.js'"

- [ ] **Step 3: Implement daemon**

```typescript
// src/auth/daemon.ts
import { SocketServer, SocketRequest, DEFAULT_SOCKET_PATH } from './socket.js';
import {
  getToken,
  storeToken,
  getCredentials,
  clearAll,
  isTokenExpired,
  type StoredToken,
  type StoredCredentials,
} from './keychain.js';
import { automatedLogin } from './playwright.js';

const REFRESH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface DaemonDeps {
  keychain?: {
    getToken: () => Promise<StoredToken | null>;
    storeToken: (token: StoredToken) => Promise<void>;
    getCredentials: () => Promise<StoredCredentials | null>;
    clearAll?: () => Promise<void>;
    isTokenExpired?: (token: StoredToken) => boolean;
  };
  playwright?: {
    automatedLogin: (email: string, password: string) => Promise<{ token: string; expiresAt: number }>;
  };
}

export function createDaemon(deps: DaemonDeps = {}) {
  const keychain = deps.keychain ?? {
    getToken,
    storeToken,
    getCredentials,
    clearAll,
    isTokenExpired,
  };

  const playwright = deps.playwright ?? { automatedLogin };

  let refreshTimer: NodeJS.Timeout | null = null;
  let socketServer: SocketServer | null = null;
  let lastError: string | null = null;

  async function refreshIfNeeded(): Promise<void> {
    const token = await keychain.getToken();

    if (!token) {
      lastError = 'No token stored';
      return;
    }

    const shouldRefresh = keychain.isTokenExpired?.(token) ?? isTokenExpired(token);

    if (!shouldRefresh) {
      lastError = null;
      return;
    }

    const credentials = await keychain.getCredentials();
    if (!credentials) {
      lastError = 'No credentials stored - re-login required';
      return;
    }

    try {
      console.error('[daemon] Token expiring soon, refreshing...');
      const result = await playwright.automatedLogin(credentials.email, credentials.password);
      await keychain.storeToken({ token: result.token, expiresAt: result.expiresAt });
      console.error('[daemon] Token refreshed successfully');
      lastError = null;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown refresh error';
      console.error(`[daemon] Refresh failed: ${lastError}`);
    }
  }

  async function handleRequest(req: SocketRequest): Promise<object> {
    if (req.method === 'GET' && req.path === '/token') {
      const token = await keychain.getToken();
      if (!token) {
        return { error: 'Not authenticated. Run `copilot-auth login` first.' };
      }
      return {
        token: token.token,
        expiresAt: new Date(token.expiresAt).toISOString(),
      };
    }

    if (req.method === 'GET' && req.path === '/status') {
      const token = await keychain.getToken();
      const credentials = await keychain.getCredentials();
      return {
        authenticated: !!token,
        email: credentials?.email ?? null,
        expiresAt: token ? new Date(token.expiresAt).toISOString() : null,
        lastError,
      };
    }

    if (req.method === 'POST' && req.path === '/refresh') {
      try {
        await refreshIfNeeded();
        const token = await keychain.getToken();
        return {
          success: !lastError,
          expiresAt: token ? new Date(token.expiresAt).toISOString() : null,
          error: lastError,
        };
      } catch (err) {
        return {
          success: false,
          expiresAt: null,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    return { error: `Unknown request: ${req.method} ${req.path}` };
  }

  async function start(socketPath: string = DEFAULT_SOCKET_PATH): Promise<void> {
    socketServer = new SocketServer(socketPath, handleRequest);
    await socketServer.start();

    // Start periodic refresh check
    refreshTimer = setInterval(() => {
      refreshIfNeeded().catch(console.error);
    }, REFRESH_CHECK_INTERVAL);

    // Initial refresh check
    await refreshIfNeeded();

    console.error(`[daemon] Auth daemon started on ${socketPath}`);
  }

  async function stop(): Promise<void> {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (socketServer) {
      await socketServer.stop();
      socketServer = null;
    }
    console.error('[daemon] Auth daemon stopped');
  }

  return {
    start,
    stop,
    handleRequest,
    refreshIfNeeded,
  };
}

// CLI entry point for daemon
export async function runDaemon(): Promise<void> {
  const daemon = createDaemon();

  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/daemon.ts tests/auth/daemon.test.ts
git commit -m "feat(auth): add token refresh daemon"
```

---

## Phase 2: CLI and Server Split

### Task 5: Create Auth CLI

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Implement CLI**

```typescript
// src/cli.ts
#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  storeToken,
  storeCredentials,
  clearAll,
  getToken,
  getCredentials,
} from './auth/keychain.js';
import { interactiveLogin, isPlaywrightAvailable } from './auth/playwright.js';
import { SocketClient, DEFAULT_SOCKET_PATH } from './auth/socket.js';
import { runDaemon } from './auth/daemon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function formatTimeRemaining(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  const minutes = Math.round(diff / 1000 / 60);

  if (minutes < 0) {
    const ago = Math.abs(minutes);
    if (ago < 60) return `expired ${ago} minutes ago`;
    const hours = Math.round(ago / 60);
    return `expired ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (minutes < 60) return `expires in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `expires in ${hours} hour${hours === 1 ? '' : 's'}`;
}

async function runLogin(): Promise<void> {
  if (!await isPlaywrightAvailable()) {
    console.error('Playwright is required for login.');
    console.error('Run: npx playwright install chromium');
    process.exit(1);
  }

  try {
    const result = await interactiveLogin();

    // Store credentials for future automated refresh
    await storeCredentials({ email: result.email, password: result.password });

    // Store token
    await storeToken({ token: result.token, expiresAt: result.expiresAt });

    console.log(`\nLogin successful (${formatTimeRemaining(new Date(result.expiresAt))}).`);
    console.log('Token and credentials stored securely in keychain.');

    // Start daemon if not running
    const client = new SocketClient();
    if (!await client.isRunning()) {
      console.log('Starting auth daemon...');
      await startDaemonBackground();
      console.log('Auth daemon started.');
    }
  } catch (error) {
    console.error(`\nLogin failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

async function runLogout(): Promise<void> {
  await clearAll();

  // Stop daemon if running
  const client = new SocketClient();
  if (await client.isRunning()) {
    console.log('Stopping auth daemon...');
    // The daemon will stop when it loses the socket
    // For now, just notify
  }

  console.log('Logged out. Credentials and tokens cleared from keychain.');
}

async function runStatus(): Promise<void> {
  const client = new SocketClient();

  // Check daemon status
  const daemonRunning = await client.isRunning();

  if (daemonRunning) {
    try {
      const status = await client.getStatus();
      console.log(`Status: ${status.authenticated ? 'Authenticated' : 'Not authenticated'}`);
      if (status.email) {
        console.log(`Email: ${status.email}`);
      }
      if (status.expiresAt) {
        console.log(`Token: ${formatTimeRemaining(new Date(status.expiresAt))}`);
      }
      console.log('Daemon: Running');
      if ((status as any).lastError) {
        console.log(`Last error: ${(status as any).lastError}`);
      }
      return;
    } catch {
      // Fall through to local check
    }
  }

  // Daemon not running, check keychain directly
  const token = await getToken();
  const credentials = await getCredentials();

  if (!token) {
    console.log('Status: Not authenticated');
    console.log('Daemon: Not running');
    console.log("\nRun 'copilot-auth login' to authenticate.");
    return;
  }

  console.log(`Status: Authenticated`);
  if (credentials?.email) {
    console.log(`Email: ${credentials.email}`);
  }
  console.log(`Token: ${formatTimeRemaining(new Date(token.expiresAt))}`);
  console.log('Daemon: Not running');
  console.log("\nRun 'copilot-auth daemon start' to enable automatic token refresh.");
}

async function startDaemonBackground(): Promise<void> {
  const daemonScript = join(__dirname, 'auth', 'daemon.js');

  const child = spawn(process.execPath, [daemonScript, '--run'], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  // Wait for daemon to start
  const client = new SocketClient();
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await client.isRunning()) {
      return;
    }
  }

  throw new Error('Daemon failed to start');
}

async function runDaemonCommand(subcommand: string): Promise<void> {
  const client = new SocketClient();

  switch (subcommand) {
    case 'start': {
      if (await client.isRunning()) {
        console.log('Auth daemon is already running.');
        return;
      }
      await startDaemonBackground();
      console.log('Auth daemon started.');
      break;
    }

    case 'stop': {
      if (!await client.isRunning()) {
        console.log('Auth daemon is not running.');
        return;
      }
      // Send stop signal - daemon handles SIGTERM
      console.log('Stopping daemon... (use Ctrl+C or kill the process)');
      break;
    }

    case 'status': {
      if (await client.isRunning()) {
        const status = await client.getStatus();
        console.log('Daemon: Running');
        console.log(`Authenticated: ${status.authenticated}`);
        if (status.expiresAt) {
          console.log(`Token: ${formatTimeRemaining(new Date(status.expiresAt))}`);
        }
      } else {
        console.log('Daemon: Not running');
      }
      break;
    }

    case 'run': {
      // Run daemon in foreground (used internally)
      await runDaemon();
      break;
    }

    default:
      console.error(`Unknown daemon subcommand: ${subcommand}`);
      console.error('Usage: copilot-auth daemon [start|stop|status]');
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`Usage: copilot-auth <command>

Commands:
  login           Authenticate with Copilot Money (interactive)
  logout          Clear stored credentials and tokens
  status          Show authentication status

  daemon start    Start the token refresh daemon
  daemon stop     Stop the token refresh daemon
  daemon status   Check if daemon is running
`);
}

async function main(): Promise<void> {
  const [command, subcommand] = process.argv.slice(2);

  switch (command) {
    case 'login':
      await runLogin();
      break;

    case 'logout':
      await runLogout();
      break;

    case 'status':
      await runStatus();
      break;

    case 'daemon':
      await runDaemonCommand(subcommand || 'status');
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
```

- [ ] **Step 2: Run build to verify compilation**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(auth): add copilot-auth CLI"
```

---

### Task 6: Create Server Entry Point

**Files:**
- Create: `src/server.ts`
- Modify: `src/auth/manager.ts`

- [ ] **Step 1: Update auth manager to use socket client**

```typescript
// src/auth/manager.ts - replace entire file
import { SocketClient } from './socket.js';
import { CopilotMoneyError } from '../types/error.js';

const TOKEN_CACHE_TTL = 30 * 1000; // 30 seconds

export class AuthManager {
  private cachedToken: string | null = null;
  private cachedExpiry: number = 0;
  private client: SocketClient;

  constructor(socketClient?: SocketClient) {
    this.client = socketClient ?? new SocketClient();
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.cachedExpiry) {
      return this.cachedToken;
    }

    try {
      const response = await this.client.getToken();
      this.cachedToken = response.token;
      this.cachedExpiry = Date.now() + TOKEN_CACHE_TTL;
      return response.token;
    } catch (error) {
      throw new CopilotMoneyError(
        'NOT_AUTHENTICATED',
        error instanceof Error ? error.message : 'Failed to get token from auth daemon'
      );
    }
  }

  async ensureAuthenticated(): Promise<string> {
    return this.getAccessToken();
  }

  async handleAuthError(): Promise<string> {
    // Clear cache and try to refresh
    this.cachedToken = null;
    this.cachedExpiry = 0;

    try {
      await this.client.refresh();
      return this.getAccessToken();
    } catch {
      throw new CopilotMoneyError(
        'NOT_AUTHENTICATED',
        "Session expired. Run 'copilot-auth login' to re-authenticate."
      );
    }
  }
}

let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
```

- [ ] **Step 2: Create server entry point**

```typescript
// src/server.ts
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthManager } from './auth/manager.js';
import { GraphQLClient } from './graphql/client.js';
import { registerTools } from './tools/index.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'copilot-money-mcp',
    version: '1.0.0',
  });

  const authManager = getAuthManager();

  const graphqlClient = new GraphQLClient(
    () => authManager.ensureAuthenticated(),
    () => authManager.handleAuthError()
  );

  registerTools(server, graphqlClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Copilot Money MCP server running on stdio');
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
```

- [ ] **Step 3: Run build to verify compilation**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server.ts src/auth/manager.ts
git commit -m "feat: add server entry point, update manager to use socket"
```

---

### Task 7: Update Package Configuration

**Files:**
- Modify: `package.json`
- Modify: `src/auth/index.ts`

- [ ] **Step 1: Update auth index exports**

```typescript
// src/auth/index.ts - replace entire file
export { getAuthManager, AuthManager } from './manager.js';
export {
  storeToken,
  getToken,
  clearToken,
  storeCredentials,
  getCredentials,
  clearCredentials,
  clearAll,
  isTokenExpired,
  createKeychain,
  type StoredToken,
  type StoredCredentials,
} from './keychain.js';
export {
  isPlaywrightAvailable,
  interactiveLogin,
  automatedLogin,
  type LoginResult,
} from './playwright.js';
export {
  SocketClient,
  SocketServer,
  DEFAULT_SOCKET_PATH,
  type TokenResponse,
  type StatusResponse,
  type RefreshResponse,
} from './socket.js';
export { createDaemon, runDaemon } from './daemon.js';
```

- [ ] **Step 2: Update package.json**

```json
{
  "name": "@dakaneye-js/copilot-money-mcp",
  "version": "2.0.0",
  "description": "MCP server for Copilot Money with read/write capabilities",
  "type": "module",
  "main": "dist/server.js",
  "bin": {
    "copilot-money-mcp": "dist/server.js",
    "copilot-auth": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "tsc --project tsconfig.test.json && node --test $(find dist/tests -name '*.test.js')",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "keywords": [
    "mcp",
    "copilot-money",
    "personal-finance"
  ],
  "author": "dakaneye",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/dakaneye/copilot-money-mcp.git"
  },
  "files": [
    "dist",
    "!dist/src",
    "!dist/tests",
    "README.md",
    "LICENSE"
  ],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "keytar": "^7.9.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.3.0",
    "typescript-eslint": "^8.0.0"
  },
  "optionalDependencies": {
    "playwright": "^1.58.2"
  }
}
```

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json src/auth/index.ts
git commit -m "feat: update package config for new auth architecture"
```

---

## Phase 3: Cleanup

### Task 8: Remove Old Auth Code

**Files:**
- Delete: `src/auth/email-link.ts`
- Delete: `src/index.ts`
- Modify: `tests/auth/manager.test.ts`

- [ ] **Step 1: Update manager tests for socket-based auth**

```typescript
// tests/auth/manager.test.ts - replace entire file
import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('AuthManager', () => {
  test('getAccessToken returns token from socket client', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'test-token-123',
        expiresAt: '2026-03-27T18:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
      isRunning: mock.fn(() => Promise.resolve(true)),
    };

    const { AuthManager } = await import('../../dist/auth/manager.js');
    const manager = new AuthManager(mockClient as any);

    const token = await manager.getAccessToken();

    assert.strictEqual(token, 'test-token-123');
    assert.strictEqual(mockClient.getToken.mock.calls.length, 1);
  });

  test('getAccessToken caches token for 30 seconds', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'test-token-123',
        expiresAt: '2026-03-27T18:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
    };

    const { AuthManager } = await import('../../dist/auth/manager.js');
    const manager = new AuthManager(mockClient as any);

    // First call
    await manager.getAccessToken();
    // Second call should use cache
    await manager.getAccessToken();

    assert.strictEqual(mockClient.getToken.mock.calls.length, 1);
  });

  test('getAccessToken throws when daemon not running', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.reject(new Error('Daemon not running'))),
      refresh: mock.fn(() => Promise.resolve({ success: false, expiresAt: null })),
    };

    const { AuthManager } = await import('../../dist/auth/manager.js');
    const manager = new AuthManager(mockClient as any);

    await assert.rejects(
      () => manager.getAccessToken(),
      /Daemon not running/
    );
  });

  test('handleAuthError attempts refresh', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'refreshed-token',
        expiresAt: '2026-03-27T19:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
    };

    const { AuthManager } = await import('../../dist/auth/manager.js');
    const manager = new AuthManager(mockClient as any);

    const token = await manager.handleAuthError();

    assert.strictEqual(mockClient.refresh.mock.calls.length, 1);
    assert.strictEqual(token, 'refreshed-token');
  });
});
```

- [ ] **Step 2: Delete old files**

```bash
rm src/auth/email-link.ts src/index.ts
```

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old auth code (email-link, old index)"
```

---

### Task 9: Update Tests for New Architecture

**Files:**
- Modify: `tests/auth/keychain.test.ts`

- [ ] **Step 1: Update keychain tests for new API**

```typescript
// tests/auth/keychain.test.ts - replace entire file
import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

async function createKeychainWithMock(mockKeytar: any) {
  // Dynamic import to avoid caching issues
  const mod = await import('../src/auth/keychain.js');
  return mod.createKeychain(mockKeytar);
}

describe('keychain - token storage', () => {
  test('storeToken saves token as JSON', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.storeToken({ token: 'abc123', expiresAt: 1711562400000 });

    assert.strictEqual(mockKeytar.setPassword.mock.calls.length, 1);
    const [service, account, value] = mockKeytar.setPassword.mock.calls[0].arguments;
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'token');
    const parsed = JSON.parse(value);
    assert.strictEqual(parsed.token, 'abc123');
    assert.strictEqual(parsed.expiresAt, 1711562400000);
  });

  test('getToken returns parsed token', async () => {
    const storedValue = JSON.stringify({ token: 'xyz789', expiresAt: 1711562400000 });
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn((service: string, account: string) => {
        if (account === 'token') return Promise.resolve(storedValue);
        return Promise.resolve(null);
      }),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getToken();

    assert.deepStrictEqual(result, { token: 'xyz789', expiresAt: 1711562400000 });
  });

  test('getToken returns null when not stored', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getToken();

    assert.strictEqual(result, null);
  });

  test('clearToken removes token', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.clearToken();

    assert.strictEqual(mockKeytar.deletePassword.mock.calls.length, 1);
  });
});

describe('keychain - credentials storage', () => {
  test('storeCredentials saves email and password', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.storeCredentials({ email: 'test@example.com', password: 'secret123' });

    assert.strictEqual(mockKeytar.setPassword.mock.calls.length, 1);
    const [service, account, value] = mockKeytar.setPassword.mock.calls[0].arguments;
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'credentials');
    const parsed = JSON.parse(value);
    assert.strictEqual(parsed.email, 'test@example.com');
    assert.strictEqual(parsed.password, 'secret123');
  });

  test('getCredentials returns stored credentials', async () => {
    const storedValue = JSON.stringify({ email: 'test@example.com', password: 'secret123' });
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn((service: string, account: string) => {
        if (account === 'credentials') return Promise.resolve(storedValue);
        return Promise.resolve(null);
      }),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getCredentials();

    assert.deepStrictEqual(result, { email: 'test@example.com', password: 'secret123' });
  });
});

describe('keychain - isTokenExpired', () => {
  test('returns true when token expires within 10 minutes', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const token = { token: 'test', expiresAt: Date.now() + 5 * 60 * 1000 }; // 5 min

    assert.strictEqual(keychain.isTokenExpired(token), true);
  });

  test('returns false when token has more than 10 minutes left', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const token = { token: 'test', expiresAt: Date.now() + 30 * 60 * 1000 }; // 30 min

    assert.strictEqual(keychain.isTokenExpired(token), false);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/auth/keychain.test.ts
git commit -m "test: update keychain tests for new API"
```

---

### Task 10: Final Integration Test

**Files:**
- Manual testing

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Run linter**

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 4: Test CLI help**

```bash
node dist/cli.js --help
```

Expected output:
```
Usage: copilot-auth <command>

Commands:
  login           Authenticate with Copilot Money (interactive)
  logout          Clear stored credentials and tokens
  status          Show authentication status

  daemon start    Start the token refresh daemon
  daemon stop     Stop the token refresh daemon
  daemon status   Check if daemon is running
```

- [ ] **Step 5: Test server startup error (daemon not running)**

```bash
node dist/server.js 2>&1 | head -5
```

Expected: Error message about daemon not running

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: complete auth redesign implementation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Extend keychain for credentials | keychain.ts |
| 2 | Create Unix socket module | socket.ts |
| 3 | Rewrite Playwright for passwords | playwright.ts |
| 4 | Create auth daemon | daemon.ts |
| 5 | Create auth CLI | cli.ts |
| 6 | Create server entry point | server.ts, manager.ts |
| 7 | Update package configuration | package.json, index.ts |
| 8 | Remove old auth code | delete email-link.ts, index.ts |
| 9 | Update tests | *.test.ts |
| 10 | Final integration test | manual |

**Total:** 10 tasks, ~50 steps
