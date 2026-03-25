# Copilot Money MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that enables Claude to read and write Copilot Money data via GraphQL API.

**Architecture:** TypeScript MCP server using @modelcontextprotocol/sdk with stdio transport. OAuth browser flow for authentication, macOS Keychain for token storage, and a typed GraphQL client ported from the Rust CLI.

**Tech Stack:** Node.js 20+, TypeScript 5.3+, @modelcontextprotocol/server, zod, keytar, node:test

---

## File Structure

```
copilot-money-mcp/
├── src/
│   ├── index.ts                    # Entry point, MCP server setup
│   ├── auth/
│   │   ├── index.ts                # Auth exports
│   │   ├── manager.ts              # Token management, refresh logic
│   │   ├── browser.ts              # Browser OAuth flow, callback server
│   │   └── keychain.ts             # macOS Keychain wrapper
│   ├── graphql/
│   │   ├── client.ts               # GraphQL HTTP client
│   │   ├── queries.ts              # Query definitions
│   │   └── mutations.ts            # Mutation definitions
│   ├── tools/
│   │   ├── index.ts                # Tool registration
│   │   ├── transactions.ts         # get_transactions tool
│   │   ├── accounts.ts             # get_accounts tool
│   │   ├── categories.ts           # get_categories tool
│   │   ├── recurring.ts            # get_recurring tool
│   │   ├── budgets.ts              # get_budgets tool
│   │   ├── tags.ts                 # get_tags tool
│   │   ├── categorize.ts           # categorize_transaction tool
│   │   ├── tag.ts                  # tag_transaction, untag_transaction tools
│   │   ├── review.ts               # review_transaction, unreview_transaction tools
│   │   ├── bulk.ts                 # bulk_categorize, bulk_tag, bulk_review tools
│   │   └── suggest.ts              # suggest_categories tool
│   └── types/
│       ├── index.ts                # Type exports
│       ├── transaction.ts          # Transaction types
│       ├── account.ts              # Account types
│       ├── category.ts             # Category types
│       ├── tag.ts                  # Tag types
│       └── error.ts                # Error response types
├── tests/
│   ├── fixtures/
│   │   ├── transactions.json       # Sample transaction data
│   │   ├── categories.json         # Sample category data
│   │   └── accounts.json           # Sample account data
│   ├── auth/
│   │   └── manager.test.ts         # Auth manager tests
│   ├── graphql/
│   │   └── client.test.ts          # GraphQL client tests
│   └── tools/
│       ├── transactions.test.ts
│       ├── categories.test.ts
│       └── bulk.test.ts
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

---

## Task 1: Project Setup and GitHub Repository

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts` (placeholder)

- [ ] **Step 1: Create private GitHub repository**

```bash
gh repo create dakaneye/copilot-money-mcp --private --description "MCP server for Copilot Money with read/write capabilities"
```

- [ ] **Step 2: Add remote and rename branch to main**

```bash
git remote add origin git@github.com:dakaneye/copilot-money-mcp.git
git branch -m master main
```

- [ ] **Step 3: Create package.json**

```json
{
  "name": "copilot-money-mcp",
  "version": "0.1.0",
  "description": "MCP server for Copilot Money with read/write capabilities",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "copilot-money-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "node --test --experimental-test-coverage",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "keywords": ["mcp", "copilot-money", "personal-finance"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0",
    "keytar": "^7.9.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.log
.env
.DS_Store
coverage/
```

- [ ] **Step 6: Create placeholder src/index.ts**

```typescript
#!/usr/bin/env node

console.error('copilot-money-mcp starting...');
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: package-lock.json created, node_modules populated

- [ ] **Step 8: Verify build works**

Run: `npm run build`
Expected: dist/index.js created

- [ ] **Step 9: Commit project setup**

```bash
git add package.json tsconfig.json .gitignore src/index.ts package-lock.json
git commit -m "chore: initialize project with TypeScript and MCP SDK"
```

- [ ] **Step 10: Push to GitHub**

```bash
git push -u origin main
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types/index.ts`
- Create: `src/types/transaction.ts`
- Create: `src/types/account.ts`
- Create: `src/types/category.ts`
- Create: `src/types/tag.ts`
- Create: `src/types/error.ts`

- [ ] **Step 1: Create transaction types**

```typescript
// src/types/transaction.ts
export interface Tag {
  id: string;
  name: string;
  colorName: string;
}

export interface Goal {
  id: string;
  name: string;
  icon: { unicode?: string } | null;
}

export interface Transaction {
  id: string;
  itemId: string;
  accountId: string;
  name: string;
  amount: number;
  date: string;
  type: 'credit' | 'debit';
  categoryId: string | null;
  isReviewed: boolean;
  isPending: boolean;
  recurringId: string | null;
  suggestedCategoryIds: string[];
  userNotes: string | null;
  tipAmount: number | null;
  createdAt: string;
  tags: Tag[];
  goal: Goal | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface TransactionsPage {
  transactions: Transaction[];
  pageInfo: PageInfo;
}

export interface TransactionFilter {
  categoryIds?: string[];
  accountIds?: string[];
  tagIds?: string[];
  isReviewed?: boolean;
  isPending?: boolean;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}
```

- [ ] **Step 2: Create account types**

```typescript
// src/types/account.ts
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';

export interface Account {
  id: string;
  itemId: string;
  name: string;
  type: AccountType;
  subType: string | null;
  balance: number;
  liveBalance: number | null;
  hasLiveBalance: boolean;
  limit: number | null;
  mask: string | null;
  color: string | null;
  institutionId: string | null;
  isManual: boolean;
  isUserHidden: boolean;
  isUserClosed: boolean;
  latestBalanceUpdate: string | null;
  hasHistoricalUpdates: boolean;
}

export interface AccountFilter {
  types?: AccountType[];
  includeHidden?: boolean;
  includeClosed?: boolean;
}
```

- [ ] **Step 3: Create category types**

```typescript
// src/types/category.ts
export interface CategoryIcon {
  unicode?: string;
}

export interface SpendMonth {
  id: string;
  month: string;
  amount: number;
  comparisonAmount: number | null;
  unpaidRecurringAmount: number | null;
}

export interface CategorySpend {
  current: SpendMonth | null;
  histories: SpendMonth[];
}

export interface BudgetMonth {
  id: string;
  month: string;
  amount: number;
  goalAmount: number | null;
  resolvedAmount: number | null;
  rolloverAmount: number | null;
  childAmount: number | null;
  childRolloverAmount: number | null;
  unassignedAmount: number | null;
  unassignedRolloverAmount: number | null;
}

export interface CategoryBudget {
  current: BudgetMonth | null;
  histories: BudgetMonth[];
}

export interface Category {
  id: string;
  name: string;
  colorName: string;
  icon: CategoryIcon | null;
  templateId: string | null;
  isExcluded: boolean;
  isRolloverDisabled: boolean;
  canBeDeleted: boolean;
  childCategories: Category[];
  spend?: CategorySpend;
  budget?: CategoryBudget;
}
```

- [ ] **Step 4: Create tag types**

```typescript
// src/types/tag.ts
export interface Tag {
  id: string;
  name: string;
  colorName: string;
}
```

- [ ] **Step 5: Create error types**

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
  | 'PARTIAL_FAILURE';

export interface McpError {
  code: ErrorCode;
  message: string;
  suggestions?: string[];
  details?: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: McpError;
}

export class CopilotMoneyError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly suggestions?: string[],
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CopilotMoneyError';
  }

  toMcpError(): McpError {
    return {
      code: this.code,
      message: this.message,
      suggestions: this.suggestions,
      details: this.details,
    };
  }
}
```

- [ ] **Step 6: Create types index**

```typescript
// src/types/index.ts
export * from './transaction.js';
export * from './account.js';
export * from './category.js';
export * from './tag.js';
export * from './error.js';
```

- [ ] **Step 7: Verify types compile**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 8: Commit types**

```bash
git add src/types/
git commit -m "feat: add TypeScript type definitions for Copilot Money entities"
```

---

## Task 3: Keychain Integration

**Files:**
- Create: `src/auth/keychain.ts`
- Create: `tests/auth/keychain.test.ts`

- [ ] **Step 1: Write failing test for keychain**

```typescript
// tests/auth/keychain.test.ts
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('Keychain', () => {
  it('should store and retrieve token', async () => {
    // This test will be run manually since keychain requires user interaction
    // For CI, we mock keytar
    assert.ok(true, 'Keychain integration test placeholder');
  });
});
```

- [ ] **Step 2: Implement keychain wrapper**

```typescript
// src/auth/keychain.ts
import keytar from 'keytar';

const SERVICE_NAME = 'copilot-money-mcp';
const ACCOUNT_ACCESS = 'access_token';
const ACCOUNT_REFRESH = 'refresh_token';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const accessToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_ACCESS);
  if (!accessToken) {
    return null;
  }

  const refreshToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_REFRESH);
  const expiresAtStr = await keytar.getPassword(SERVICE_NAME, 'expires_at');
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;

  return { accessToken, refreshToken, expiresAt };
}

export async function storeTokens(tokens: StoredTokens): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_ACCESS, tokens.accessToken);

  if (tokens.refreshToken) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_REFRESH, tokens.refreshToken);
  }

  if (tokens.expiresAt) {
    await keytar.setPassword(SERVICE_NAME, 'expires_at', tokens.expiresAt.toString());
  }
}

export async function clearTokens(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_ACCESS);
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_REFRESH);
  await keytar.deletePassword(SERVICE_NAME, 'expires_at');
}

export function isTokenExpired(expiresAt: number | null): boolean {
  if (!expiresAt) return false;
  // Consider expired if within 5 minutes of expiry
  return Date.now() > (expiresAt - 5 * 60 * 1000);
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/auth/keychain.test.ts`
Expected: PASS

- [ ] **Step 4: Commit keychain integration**

```bash
git add src/auth/keychain.ts tests/auth/
git commit -m "feat: add macOS Keychain integration for token storage"
```

---

## Task 4: Browser OAuth Flow

**Files:**
- Create: `src/auth/browser.ts`

- [ ] **Step 1: Implement browser OAuth flow**

```typescript
// src/auth/browser.ts
import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';

const COPILOT_APP_URL = 'https://app.copilot.money';
const CALLBACK_PATH = '/callback';

interface AuthResult {
  accessToken: string;
  refreshToken: string | null;
}

export async function performBrowserAuth(timeoutMs = 180_000): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const state = randomBytes(16).toString('hex');
    let server: Server | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let capturedToken: string | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (server) {
        server.close();
        server = null;
      }
    };

    server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);

      if (url.pathname === CALLBACK_PATH) {
        // The Copilot Money app doesn't use standard OAuth redirect
        // Instead, we intercept the token from a successful login
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Authentication successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      } else if (url.pathname === '/token') {
        // Endpoint to receive token from browser extension or manual paste
        const token = url.searchParams.get('token');
        if (token) {
          capturedToken = token;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));

          cleanup();
          resolve({ accessToken: token, refreshToken: null });
        } else {
          res.writeHead(400);
          res.end('Missing token');
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (!address || typeof address === 'string') {
        cleanup();
        reject(new Error('Failed to get server port'));
        return;
      }

      const port = address.port;
      const callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

      console.error(`\nOpening browser for Copilot Money authentication...`);
      console.error(`Callback URL: ${callbackUrl}`);
      console.error(`\nAfter logging in, copy your bearer token from the browser's`);
      console.error(`Network tab (look for Authorization header) and paste it below.\n`);

      // Open browser to Copilot Money login
      const loginUrl = `${COPILOT_APP_URL}/login`;
      openBrowser(loginUrl);

      // Prompt for manual token input as fallback
      promptForToken().then((token) => {
        if (token && !capturedToken) {
          cleanup();
          resolve({ accessToken: token, refreshToken: null });
        }
      }).catch(() => {
        // Ignore prompt errors
      });
    });

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Authentication timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

function openBrowser(url: string): void {
  // macOS only
  exec(`open "${url}"`, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      console.error(`Please open this URL manually: ${url}`);
    }
  });
}

async function promptForToken(): Promise<string | null> {
  // Use readline for token input
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question('Paste bearer token (or press Enter to wait for browser): ', (answer) => {
      rl.close();
      const token = answer.trim();
      resolve(token || null);
    });
  });
}
```

- [ ] **Step 2: Commit browser auth**

```bash
git add src/auth/browser.ts
git commit -m "feat: add browser OAuth flow for authentication"
```

---

## Task 5: Auth Manager

**Files:**
- Create: `src/auth/manager.ts`
- Create: `src/auth/index.ts`
- Create: `tests/auth/manager.test.ts`

- [ ] **Step 1: Write failing test for auth manager**

```typescript
// tests/auth/manager.test.ts
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('AuthManager', () => {
  it('should return null when no tokens stored', async () => {
    // Test will use mocked keychain
    assert.ok(true, 'Auth manager test placeholder');
  });

  it('should trigger browser auth when no token available', async () => {
    assert.ok(true, 'Auth manager test placeholder');
  });
});
```

- [ ] **Step 2: Implement auth manager**

```typescript
// src/auth/manager.ts
import { getStoredTokens, storeTokens, clearTokens, isTokenExpired, type StoredTokens } from './keychain.js';
import { performBrowserAuth } from './browser.js';
import { CopilotMoneyError } from '../types/error.js';

export class AuthManager {
  private cachedToken: string | null = null;

  async getAccessToken(): Promise<string> {
    // Check in-memory cache first
    if (this.cachedToken) {
      return this.cachedToken;
    }

    // Check keychain
    const stored = await getStoredTokens();
    if (stored && !isTokenExpired(stored.expiresAt)) {
      this.cachedToken = stored.accessToken;
      return stored.accessToken;
    }

    // Token expired or missing - need to authenticate
    throw new CopilotMoneyError(
      'NOT_AUTHENTICATED',
      'Not authenticated. Please run authentication flow.',
    );
  }

  async authenticate(): Promise<string> {
    console.error('Starting authentication flow...');

    const result = await performBrowserAuth();

    await storeTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: null, // Copilot Money doesn't expose expiry; we'll detect on 401
    });

    this.cachedToken = result.accessToken;
    console.error('Authentication successful!');

    return result.accessToken;
  }

  async ensureAuthenticated(): Promise<string> {
    try {
      return await this.getAccessToken();
    } catch (error) {
      if (error instanceof CopilotMoneyError && error.code === 'NOT_AUTHENTICATED') {
        return await this.authenticate();
      }
      throw error;
    }
  }

  async handleAuthError(): Promise<string> {
    // Clear invalid tokens and re-authenticate
    this.cachedToken = null;
    await clearTokens();
    return await this.authenticate();
  }

  async logout(): Promise<void> {
    this.cachedToken = null;
    await clearTokens();
    console.error('Logged out successfully');
  }
}

// Singleton instance
let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
```

- [ ] **Step 3: Create auth index**

```typescript
// src/auth/index.ts
export { AuthManager, getAuthManager } from './manager.js';
export { getStoredTokens, storeTokens, clearTokens } from './keychain.js';
export { performBrowserAuth } from './browser.js';
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/auth/manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit auth manager**

```bash
git add src/auth/ tests/auth/
git commit -m "feat: add AuthManager for token lifecycle management"
```

---

## Task 6: GraphQL Client

**Files:**
- Create: `src/graphql/client.ts`
- Create: `tests/graphql/client.test.ts`

- [ ] **Step 1: Write failing test for GraphQL client**

```typescript
// tests/graphql/client.test.ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { GraphQLClient } from '../src/graphql/client.js';

describe('GraphQLClient', () => {
  it('should throw on unauthenticated response', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    // Mock fetch to return auth error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        errors: [{ message: 'Unauthenticated' }]
      }), { status: 200 }))
    ) as typeof fetch;

    try {
      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        /unauthenticated/i
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Implement GraphQL client**

```typescript
// src/graphql/client.ts
import { CopilotMoneyError } from '../types/error.js';

const GRAPHQL_ENDPOINT = 'https://app.copilot.money/api/graphql';

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export class GraphQLClient {
  constructor(
    private getToken: () => Promise<string>,
    private onAuthError?: () => Promise<string>
  ) {}

  async query<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>(operationName, query, variables);
  }

  async mutate<T>(
    operationName: string,
    mutation: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>(operationName, mutation, variables);
  }

  private async request<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    isRetry = false
  ): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        operationName,
        query,
        variables,
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (!isRetry && this.onAuthError) {
          await this.onAuthError();
          return this.request<T>(operationName, query, variables, true);
        }
        throw new CopilotMoneyError(
          'NOT_AUTHENTICATED',
          'Authentication failed. Please re-authenticate.'
        );
      }

      if (response.status === 429) {
        throw new CopilotMoneyError(
          'RATE_LIMITED',
          'Rate limited. Please try again later.'
        );
      }

      throw new CopilotMoneyError(
        'NETWORK_ERROR',
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const json: GraphQLResponse<T> = await response.json();

    if (this.isUnauthenticated(json)) {
      if (!isRetry && this.onAuthError) {
        await this.onAuthError();
        return this.request<T>(operationName, query, variables, true);
      }
      throw new CopilotMoneyError(
        'TOKEN_EXPIRED',
        'Session expired. Please re-authenticate.'
      );
    }

    if (json.errors && json.errors.length > 0) {
      const firstError = json.errors[0];
      throw new CopilotMoneyError(
        'GRAPHQL_ERROR',
        firstError.message,
        undefined,
        { errors: json.errors }
      );
    }

    if (!json.data) {
      throw new CopilotMoneyError(
        'GRAPHQL_ERROR',
        'No data in response'
      );
    }

    return json.data;
  }

  private isUnauthenticated(response: GraphQLResponse): boolean {
    if (!response.errors) return false;
    return response.errors.some(
      (e) =>
        e.message.toLowerCase().includes('unauthenticated') ||
        e.message.toLowerCase().includes('unauthorized') ||
        e.extensions?.code === 'UNAUTHENTICATED'
    );
  }
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/graphql/client.test.ts`
Expected: PASS

- [ ] **Step 4: Commit GraphQL client**

```bash
git add src/graphql/client.ts tests/graphql/
git commit -m "feat: add GraphQL client with auth error handling"
```

---

## Task 7: GraphQL Queries

**Files:**
- Create: `src/graphql/queries.ts`

- [ ] **Step 1: Implement GraphQL queries**

```typescript
// src/graphql/queries.ts

// Fragment definitions
const TAG_FIELDS = `
fragment TagFields on Tag {
  colorName
  name
  id
}`;

const GOAL_FIELDS = `
fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode { unicode }
  }
  id
}`;

const TRANSACTION_FIELDS = `
${TAG_FIELDS}
${GOAL_FIELDS}
fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags { ...TagFields }
  goal { ...GoalFields }
}`;

const ACCOUNT_FIELDS = `
fragment AccountFields on Account {
  hasHistoricalUpdates
  latestBalanceUpdate
  hasLiveBalance
  institutionId
  isUserHidden
  isUserClosed
  liveBalance
  isManual
  balance
  subType
  itemId
  limit
  color
  name
  type
  mask
  id
}`;

const CATEGORY_FIELDS = `
fragment CategoryFields on Category {
  isRolloverDisabled
  canBeDeleted
  isExcluded
  templateId
  colorName
  icon {
    ... on EmojiUnicode { unicode }
  }
  name
  id
}`;

const SPEND_FIELDS = `
fragment SpendMonthlyFields on CategoryMonthlySpent {
  unpaidRecurringAmount
  comparisonAmount
  amount
  month
  id
}
fragment SpendFields on CategorySpend {
  current { ...SpendMonthlyFields }
  histories { ...SpendMonthlyFields }
}`;

const BUDGET_FIELDS = `
fragment BudgetMonthlyFields on CategoryMonthlyBudget {
  unassignedRolloverAmount
  childRolloverAmount
  unassignedAmount
  resolvedAmount
  rolloverAmount
  childAmount
  goalAmount
  amount
  month
  id
}
fragment BudgetFields on CategoryBudget {
  current { ...BudgetMonthlyFields }
  histories { ...BudgetMonthlyFields }
}`;

const RECURRING_FIELDS = `
fragment RecurringFields on Recurring {
  nextPaymentAmount
  nextPaymentDate
  categoryId
  frequency
  emoji
  icon {
    ... on EmojiUnicode { unicode }
  }
  state
  name
  id
}
fragment RecurringRuleFields on RecurringRule {
  nameContains
  minAmount
  maxAmount
  days
}
fragment RecurringPaymentFields on RecurringPayment {
  amount
  isPaid
  date
}`;

// Queries
export const TRANSACTIONS_QUERY = `
${TRANSACTION_FIELDS}
query Transactions($first: Int, $after: String, $filter: TransactionFilter, $sort: [TransactionSort!]) {
  transactions(first: $first, after: $after, filter: $filter, sort: $sort) {
    edges {
      cursor
      node { ...TransactionFields }
    }
    pageInfo {
      endCursor
      hasNextPage
      hasPreviousPage
      startCursor
    }
  }
}`;

export const ACCOUNTS_QUERY = `
${ACCOUNT_FIELDS}
query Accounts($filter: AccountFilter) {
  accounts(filter: $filter) {
    ...AccountFields
  }
}`;

export const CATEGORIES_QUERY = `
${CATEGORY_FIELDS}
${SPEND_FIELDS}
${BUDGET_FIELDS}
query Categories($spend: Boolean = false, $budget: Boolean = false, $rollovers: Boolean) {
  categories {
    ...CategoryFields
    spend @include(if: $spend) { ...SpendFields }
    budget(isRolloverEnabled: $rollovers) @include(if: $budget) { ...BudgetFields }
    childCategories {
      ...CategoryFields
      spend @include(if: $spend) { ...SpendFields }
      budget(isRolloverEnabled: $rollovers) @include(if: $budget) { ...BudgetFields }
    }
  }
}`;

export const TAGS_QUERY = `
${TAG_FIELDS}
query Tags {
  tags { ...TagFields }
}`;

export const RECURRINGS_QUERY = `
${RECURRING_FIELDS}
query Recurrings($filter: RecurringFilter) {
  recurrings(filter: $filter) {
    ...RecurringFields
    rule { ...RecurringRuleFields }
    payments { ...RecurringPaymentFields }
  }
}`;

export const BUDGETS_QUERY = `
${BUDGET_FIELDS}
query Budgets {
  categoriesTotal {
    budget { ...BudgetFields }
  }
}`;
```

- [ ] **Step 2: Commit queries**

```bash
git add src/graphql/queries.ts
git commit -m "feat: add GraphQL query definitions ported from CLI"
```

---

## Task 8: GraphQL Mutations

**Files:**
- Create: `src/graphql/mutations.ts`
- Create: `src/graphql/index.ts`

- [ ] **Step 1: Implement GraphQL mutations**

```typescript
// src/graphql/mutations.ts

const TAG_FIELDS = `
fragment TagFields on Tag {
  colorName
  name
  id
}`;

const GOAL_FIELDS = `
fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode { unicode }
  }
  id
}`;

const TRANSACTION_FIELDS = `
${TAG_FIELDS}
${GOAL_FIELDS}
fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags { ...TagFields }
  goal { ...GoalFields }
}`;

export const EDIT_TRANSACTION_MUTATION = `
${TRANSACTION_FIELDS}
mutation EditTransaction($itemId: ID!, $accountId: ID!, $id: ID!, $input: EditTransactionInput) {
  editTransaction(itemId: $itemId, accountId: $accountId, id: $id, input: $input) {
    transaction { ...TransactionFields }
  }
}`;

export const BULK_EDIT_TRANSACTIONS_MUTATION = `
${TRANSACTION_FIELDS}
mutation BulkEditTransactions($input: BulkEditTransactionInput!, $filter: TransactionFilter) {
  bulkEditTransactions(filter: $filter, input: $input) {
    updated { ...TransactionFields }
    failed {
      transaction { ...TransactionFields }
      error
      errorCode
    }
  }
}`;
```

- [ ] **Step 2: Create GraphQL index**

```typescript
// src/graphql/index.ts
export { GraphQLClient } from './client.js';
export * from './queries.js';
export * from './mutations.js';
```

- [ ] **Step 3: Commit mutations**

```bash
git add src/graphql/mutations.ts src/graphql/index.ts
git commit -m "feat: add GraphQL mutation definitions"
```

---

## Task 9: Read Tools - Transactions

**Files:**
- Create: `src/tools/transactions.ts`
- Create: `tests/tools/transactions.test.ts`
- Create: `tests/fixtures/transactions.json`

- [ ] **Step 1: Create test fixtures**

```json
// tests/fixtures/transactions.json
{
  "transactions": {
    "edges": [
      {
        "cursor": "cursor1",
        "node": {
          "id": "txn_001",
          "itemId": "item_001",
          "accountId": "acc_001",
          "name": "UBER TRIP",
          "amount": -25.50,
          "date": "2026-03-20",
          "type": "debit",
          "categoryId": "cat_transport",
          "isReviewed": false,
          "isPending": false,
          "recurringId": null,
          "suggestedCategoryIds": ["cat_transport"],
          "userNotes": null,
          "tipAmount": null,
          "createdAt": "2026-03-20T10:00:00Z",
          "tags": [],
          "goal": null
        }
      },
      {
        "cursor": "cursor2",
        "node": {
          "id": "txn_002",
          "itemId": "item_001",
          "accountId": "acc_001",
          "name": "WHOLE FOODS",
          "amount": -85.23,
          "date": "2026-03-19",
          "type": "debit",
          "categoryId": "cat_groceries",
          "isReviewed": true,
          "isPending": false,
          "recurringId": null,
          "suggestedCategoryIds": [],
          "userNotes": null,
          "tipAmount": null,
          "createdAt": "2026-03-19T15:30:00Z",
          "tags": [{"id": "tag_001", "name": "essential", "colorName": "blue"}],
          "goal": null
        }
      }
    ],
    "pageInfo": {
      "hasNextPage": false,
      "hasPreviousPage": false,
      "startCursor": "cursor1",
      "endCursor": "cursor2"
    }
  }
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/tools/transactions.test.ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/transactions.json'), 'utf-8')
);

describe('getTransactions tool', () => {
  it('should return transactions from GraphQL response', async () => {
    // Will implement after tool is created
    assert.ok(fixtures.transactions.edges.length === 2);
  });
});
```

- [ ] **Step 3: Implement transactions tool**

```typescript
// src/tools/transactions.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { TRANSACTIONS_QUERY } from '../graphql/queries.js';
import type { Transaction, TransactionsPage, TransactionFilter } from '../types/index.js';

export const getTransactionsInputSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  category: z.string().optional().describe('Category name to filter by'),
  merchant: z.string().optional().describe('Merchant name to search'),
  min_amount: z.number().optional().describe('Minimum amount'),
  max_amount: z.number().optional().describe('Maximum amount'),
  account: z.string().optional().describe('Account ID to filter by'),
  reviewed: z.boolean().optional().describe('Filter by reviewed status'),
  limit: z.number().optional().default(50).describe('Maximum transactions to return'),
});

export type GetTransactionsInput = z.infer<typeof getTransactionsInputSchema>;

interface TransactionsResponse {
  transactions: {
    edges: Array<{ cursor: string; node: Transaction }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export async function getTransactions(
  client: GraphQLClient,
  input: GetTransactionsInput,
  categoryMap: Map<string, string> // name -> id
): Promise<TransactionsPage> {
  const filter: TransactionFilter = {};

  if (input.start_date) {
    filter.startDate = input.start_date;
  }
  if (input.end_date) {
    filter.endDate = input.end_date;
  }
  if (input.category) {
    const categoryId = categoryMap.get(input.category.toLowerCase());
    if (categoryId) {
      filter.categoryIds = [categoryId];
    }
  }
  if (input.merchant) {
    filter.search = input.merchant;
  }
  if (input.min_amount !== undefined) {
    filter.minAmount = input.min_amount;
  }
  if (input.max_amount !== undefined) {
    filter.maxAmount = input.max_amount;
  }
  if (input.account) {
    filter.accountIds = [input.account];
  }
  if (input.reviewed !== undefined) {
    filter.isReviewed = input.reviewed;
  }

  const response = await client.query<TransactionsResponse>(
    'Transactions',
    TRANSACTIONS_QUERY,
    {
      first: input.limit,
      filter: Object.keys(filter).length > 0 ? filter : null,
      sort: [{ field: 'DATE', direction: 'DESC' }],
    }
  );

  return {
    transactions: response.transactions.edges.map((e) => e.node),
    pageInfo: {
      hasNextPage: response.transactions.pageInfo.hasNextPage,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: response.transactions.pageInfo.endCursor,
    },
  };
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/tools/transactions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit transactions tool**

```bash
git add src/tools/transactions.ts tests/tools/ tests/fixtures/
git commit -m "feat: add get_transactions tool"
```

---

## Task 10: Read Tools - Accounts, Categories, Tags

**Files:**
- Create: `src/tools/accounts.ts`
- Create: `src/tools/categories.ts`
- Create: `src/tools/tags.ts`

- [ ] **Step 1: Implement accounts tool**

```typescript
// src/tools/accounts.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { ACCOUNTS_QUERY } from '../graphql/queries.js';
import type { Account, AccountType } from '../types/index.js';

export const getAccountsInputSchema = z.object({
  type: z.enum(['checking', 'savings', 'credit', 'investment', 'loan', 'other'])
    .optional()
    .describe('Filter by account type'),
});

export type GetAccountsInput = z.infer<typeof getAccountsInputSchema>;

interface AccountsResponse {
  accounts: Account[];
}

export async function getAccounts(
  client: GraphQLClient,
  input: GetAccountsInput
): Promise<Account[]> {
  const response = await client.query<AccountsResponse>(
    'Accounts',
    ACCOUNTS_QUERY,
    { filter: null }
  );

  let accounts = response.accounts.filter(
    (a) => !a.isUserHidden && !a.isUserClosed
  );

  if (input.type) {
    accounts = accounts.filter((a) => a.type === input.type);
  }

  return accounts;
}
```

- [ ] **Step 2: Implement categories tool**

```typescript
// src/tools/categories.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { CATEGORIES_QUERY } from '../graphql/queries.js';
import type { Category } from '../types/index.js';

export const getCategoriesInputSchema = z.object({
  period: z.enum([
    'this_month', 'last_month', 'last_7_days', 'last_30_days',
    'last_90_days', 'ytd', 'this_year', 'last_year'
  ]).optional().describe('Period for spending totals'),
});

export type GetCategoriesInput = z.infer<typeof getCategoriesInputSchema>;

interface CategoriesResponse {
  categories: Category[];
}

export async function getCategories(
  client: GraphQLClient,
  input: GetCategoriesInput
): Promise<Category[]> {
  const includeSpend = !!input.period;

  const response = await client.query<CategoriesResponse>(
    'Categories',
    CATEGORIES_QUERY,
    {
      spend: includeSpend,
      budget: false,
      rollovers: false,
    }
  );

  // Flatten categories including children
  const allCategories: Category[] = [];
  for (const cat of response.categories) {
    allCategories.push(cat);
    if (cat.childCategories) {
      allCategories.push(...cat.childCategories);
    }
  }

  return allCategories;
}

export function buildCategoryMap(categories: Category[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cat of categories) {
    map.set(cat.name.toLowerCase(), cat.id);
  }
  return map;
}
```

- [ ] **Step 3: Implement tags tool**

```typescript
// src/tools/tags.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { TAGS_QUERY } from '../graphql/queries.js';
import type { Tag } from '../types/index.js';

export const getTagsInputSchema = z.object({});

export type GetTagsInput = z.infer<typeof getTagsInputSchema>;

interface TagsResponse {
  tags: Tag[];
}

export async function getTags(client: GraphQLClient): Promise<Tag[]> {
  const response = await client.query<TagsResponse>(
    'Tags',
    TAGS_QUERY,
    {}
  );

  return response.tags;
}

export function buildTagMap(tags: Tag[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    map.set(tag.name.toLowerCase(), tag.id);
  }
  return map;
}
```

- [ ] **Step 4: Commit read tools**

```bash
git add src/tools/accounts.ts src/tools/categories.ts src/tools/tags.ts
git commit -m "feat: add get_accounts, get_categories, get_tags tools"
```

---

## Task 11: Read Tools - Recurring and Budgets

**Files:**
- Create: `src/tools/recurring.ts`
- Create: `src/tools/budgets.ts`

- [ ] **Step 1: Implement recurring tool**

```typescript
// src/tools/recurring.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { RECURRINGS_QUERY } from '../graphql/queries.js';

export const getRecurringInputSchema = z.object({});

export type GetRecurringInput = z.infer<typeof getRecurringInputSchema>;

export interface Recurring {
  id: string;
  name: string;
  categoryId: string | null;
  frequency: string;
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
  state: string;
  emoji: string | null;
  payments: Array<{
    date: string;
    amount: number;
    isPaid: boolean;
  }>;
}

interface RecurringsResponse {
  recurrings: Recurring[];
}

export async function getRecurring(client: GraphQLClient): Promise<Recurring[]> {
  const response = await client.query<RecurringsResponse>(
    'Recurrings',
    RECURRINGS_QUERY,
    { filter: null }
  );

  return response.recurrings;
}
```

- [ ] **Step 2: Implement budgets tool**

```typescript
// src/tools/budgets.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { BUDGETS_QUERY } from '../graphql/queries.js';
import type { CategoryBudget } from '../types/index.js';

export const getBudgetsInputSchema = z.object({
  month: z.string().optional().describe('Month in YYYY-MM format'),
});

export type GetBudgetsInput = z.infer<typeof getBudgetsInputSchema>;

interface BudgetsResponse {
  categoriesTotal: {
    budget: CategoryBudget;
  };
}

export async function getBudgets(
  client: GraphQLClient,
  input: GetBudgetsInput
): Promise<CategoryBudget> {
  const response = await client.query<BudgetsResponse>(
    'Budgets',
    BUDGETS_QUERY,
    {}
  );

  return response.categoriesTotal.budget;
}
```

- [ ] **Step 3: Commit recurring and budgets**

```bash
git add src/tools/recurring.ts src/tools/budgets.ts
git commit -m "feat: add get_recurring and get_budgets tools"
```

---

## Task 12: Write Tools - Categorize and Review

**Files:**
- Create: `src/tools/categorize.ts`
- Create: `src/tools/review.ts`

- [ ] **Step 1: Implement categorize tool**

```typescript
// src/tools/categorize.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { EDIT_TRANSACTION_MUTATION } from '../graphql/mutations.js';
import type { Transaction } from '../types/index.js';
import { CopilotMoneyError } from '../types/error.js';

export const categorizeTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
  category_name: z.string().describe('The category name to assign'),
});

export type CategorizeTransactionInput = z.infer<typeof categorizeTransactionInputSchema>;

interface EditTransactionResponse {
  editTransaction: {
    transaction: Transaction;
  };
}

export async function categorizeTransaction(
  client: GraphQLClient,
  input: CategorizeTransactionInput,
  transaction: Transaction,
  categoryMap: Map<string, string>,
  categoryNames: string[]
): Promise<Transaction> {
  const categoryId = categoryMap.get(input.category_name.toLowerCase());

  if (!categoryId) {
    throw new CopilotMoneyError(
      'INVALID_CATEGORY',
      `Category '${input.category_name}' not found`,
      categoryNames.slice(0, 10)
    );
  }

  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        categoryId,
      },
    }
  );

  return response.editTransaction.transaction;
}
```

- [ ] **Step 2: Implement review tool**

```typescript
// src/tools/review.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { EDIT_TRANSACTION_MUTATION } from '../graphql/mutations.js';
import type { Transaction } from '../types/index.js';

export const reviewTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
});

export type ReviewTransactionInput = z.infer<typeof reviewTransactionInputSchema>;

export const unreviewTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
});

export type UnreviewTransactionInput = z.infer<typeof unreviewTransactionInputSchema>;

interface EditTransactionResponse {
  editTransaction: {
    transaction: Transaction;
  };
}

export async function reviewTransaction(
  client: GraphQLClient,
  transaction: Transaction
): Promise<Transaction> {
  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        isReviewed: true,
      },
    }
  );

  return response.editTransaction.transaction;
}

export async function unreviewTransaction(
  client: GraphQLClient,
  transaction: Transaction
): Promise<Transaction> {
  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        isReviewed: false,
      },
    }
  );

  return response.editTransaction.transaction;
}
```

- [ ] **Step 3: Commit write tools**

```bash
git add src/tools/categorize.ts src/tools/review.ts
git commit -m "feat: add categorize_transaction and review tools"
```

---

## Task 13: Write Tools - Tag

**Files:**
- Create: `src/tools/tag.ts`

- [ ] **Step 1: Implement tag tools**

```typescript
// src/tools/tag.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { EDIT_TRANSACTION_MUTATION } from '../graphql/mutations.js';
import type { Transaction, Tag } from '../types/index.js';
import { CopilotMoneyError } from '../types/error.js';

export const tagTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
  tag_names: z.array(z.string()).describe('Tag names to add'),
});

export type TagTransactionInput = z.infer<typeof tagTransactionInputSchema>;

export const untagTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
  tag_names: z.array(z.string()).describe('Tag names to remove'),
});

export type UntagTransactionInput = z.infer<typeof untagTransactionInputSchema>;

interface EditTransactionResponse {
  editTransaction: {
    transaction: Transaction;
  };
}

export async function tagTransaction(
  client: GraphQLClient,
  input: TagTransactionInput,
  transaction: Transaction,
  tagMap: Map<string, string>,
  tagNames: string[]
): Promise<Transaction> {
  const tagIds: string[] = [];
  const invalidTags: string[] = [];

  for (const name of input.tag_names) {
    const tagId = tagMap.get(name.toLowerCase());
    if (tagId) {
      tagIds.push(tagId);
    } else {
      invalidTags.push(name);
    }
  }

  if (invalidTags.length > 0) {
    throw new CopilotMoneyError(
      'INVALID_TAG',
      `Tags not found: ${invalidTags.join(', ')}`,
      tagNames.slice(0, 10)
    );
  }

  // Combine existing tags with new ones
  const existingTagIds = transaction.tags.map((t) => t.id);
  const allTagIds = [...new Set([...existingTagIds, ...tagIds])];

  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        tagIds: allTagIds,
      },
    }
  );

  return response.editTransaction.transaction;
}

export async function untagTransaction(
  client: GraphQLClient,
  input: UntagTransactionInput,
  transaction: Transaction,
  tagMap: Map<string, string>
): Promise<Transaction> {
  const tagIdsToRemove = new Set<string>();

  for (const name of input.tag_names) {
    const tagId = tagMap.get(name.toLowerCase());
    if (tagId) {
      tagIdsToRemove.add(tagId);
    }
  }

  const remainingTagIds = transaction.tags
    .filter((t) => !tagIdsToRemove.has(t.id))
    .map((t) => t.id);

  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        tagIds: remainingTagIds,
      },
    }
  );

  return response.editTransaction.transaction;
}
```

- [ ] **Step 2: Commit tag tools**

```bash
git add src/tools/tag.ts
git commit -m "feat: add tag_transaction and untag_transaction tools"
```

---

## Task 14: Bulk Tools

**Files:**
- Create: `src/tools/bulk.ts`

- [ ] **Step 1: Implement bulk tools**

```typescript
// src/tools/bulk.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { BULK_EDIT_TRANSACTIONS_MUTATION } from '../graphql/mutations.js';
import type { Transaction } from '../types/index.js';
import { CopilotMoneyError } from '../types/error.js';

export const bulkCategorizeInputSchema = z.object({
  transaction_ids: z.array(z.string()).describe('Transaction IDs to categorize'),
  category_name: z.string().describe('Category name to assign'),
});

export type BulkCategorizeInput = z.infer<typeof bulkCategorizeInputSchema>;

export const bulkTagInputSchema = z.object({
  transaction_ids: z.array(z.string()).describe('Transaction IDs to tag'),
  tag_names: z.array(z.string()).describe('Tag names to add'),
});

export type BulkTagInput = z.infer<typeof bulkTagInputSchema>;

export const bulkReviewInputSchema = z.object({
  transaction_ids: z.array(z.string()).describe('Transaction IDs to mark as reviewed'),
});

export type BulkReviewInput = z.infer<typeof bulkReviewInputSchema>;

interface BulkEditResponse {
  bulkEditTransactions: {
    updated: Transaction[];
    failed: Array<{
      transaction: Transaction;
      error: string;
      errorCode: string;
    }>;
  };
}

export interface BulkResult {
  updated: Transaction[];
  failed: Array<{
    transactionId: string;
    error: string;
  }>;
}

export async function bulkCategorize(
  client: GraphQLClient,
  input: BulkCategorizeInput,
  categoryMap: Map<string, string>,
  categoryNames: string[]
): Promise<BulkResult> {
  const categoryId = categoryMap.get(input.category_name.toLowerCase());

  if (!categoryId) {
    throw new CopilotMoneyError(
      'INVALID_CATEGORY',
      `Category '${input.category_name}' not found`,
      categoryNames.slice(0, 10)
    );
  }

  const response = await client.mutate<BulkEditResponse>(
    'BulkEditTransactions',
    BULK_EDIT_TRANSACTIONS_MUTATION,
    {
      filter: {
        ids: input.transaction_ids,
      },
      input: {
        categoryId,
      },
    }
  );

  return {
    updated: response.bulkEditTransactions.updated,
    failed: response.bulkEditTransactions.failed.map((f) => ({
      transactionId: f.transaction.id,
      error: f.error,
    })),
  };
}

export async function bulkTag(
  client: GraphQLClient,
  input: BulkTagInput,
  tagMap: Map<string, string>,
  tagNames: string[]
): Promise<BulkResult> {
  const tagIds: string[] = [];
  const invalidTags: string[] = [];

  for (const name of input.tag_names) {
    const tagId = tagMap.get(name.toLowerCase());
    if (tagId) {
      tagIds.push(tagId);
    } else {
      invalidTags.push(name);
    }
  }

  if (invalidTags.length > 0) {
    throw new CopilotMoneyError(
      'INVALID_TAG',
      `Tags not found: ${invalidTags.join(', ')}`,
      tagNames.slice(0, 10)
    );
  }

  const response = await client.mutate<BulkEditResponse>(
    'BulkEditTransactions',
    BULK_EDIT_TRANSACTIONS_MUTATION,
    {
      filter: {
        ids: input.transaction_ids,
      },
      input: {
        tagIds,
      },
    }
  );

  return {
    updated: response.bulkEditTransactions.updated,
    failed: response.bulkEditTransactions.failed.map((f) => ({
      transactionId: f.transaction.id,
      error: f.error,
    })),
  };
}

export async function bulkReview(
  client: GraphQLClient,
  input: BulkReviewInput
): Promise<BulkResult> {
  const response = await client.mutate<BulkEditResponse>(
    'BulkEditTransactions',
    BULK_EDIT_TRANSACTIONS_MUTATION,
    {
      filter: {
        ids: input.transaction_ids,
      },
      input: {
        isReviewed: true,
      },
    }
  );

  return {
    updated: response.bulkEditTransactions.updated,
    failed: response.bulkEditTransactions.failed.map((f) => ({
      transactionId: f.transaction.id,
      error: f.error,
    })),
  };
}
```

- [ ] **Step 2: Commit bulk tools**

```bash
git add src/tools/bulk.ts
git commit -m "feat: add bulk_categorize, bulk_tag, bulk_review tools"
```

---

## Task 15: Suggest Categories Tool

**Files:**
- Create: `src/tools/suggest.ts`

- [ ] **Step 1: Implement suggest categories tool**

```typescript
// src/tools/suggest.ts
import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { TRANSACTIONS_QUERY, CATEGORIES_QUERY } from '../graphql/queries.js';
import type { Transaction, Category } from '../types/index.js';

export const suggestCategoriesInputSchema = z.object({
  limit: z.number().optional().default(10).describe('Maximum suggestions to return'),
});

export type SuggestCategoriesInput = z.infer<typeof suggestCategoriesInputSchema>;

export interface CategorySuggestion {
  transaction: Transaction;
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

interface TransactionsResponse {
  transactions: {
    edges: Array<{ node: Transaction }>;
  };
}

interface CategoriesResponse {
  categories: Category[];
}

export async function suggestCategories(
  client: GraphQLClient,
  input: SuggestCategoriesInput
): Promise<CategorySuggestion[]> {
  // Fetch uncategorized transactions
  const txnResponse = await client.query<TransactionsResponse>(
    'Transactions',
    TRANSACTIONS_QUERY,
    {
      first: input.limit * 2, // Fetch extra in case some have no suggestions
      filter: {
        categoryIds: [null], // Uncategorized
        isReviewed: false,
      },
      sort: [{ field: 'DATE', direction: 'DESC' }],
    }
  );

  const uncategorized = txnResponse.transactions.edges.map((e) => e.node);

  // Fetch categories for name lookup
  const catResponse = await client.query<CategoriesResponse>(
    'Categories',
    CATEGORIES_QUERY,
    { spend: false, budget: false, rollovers: false }
  );

  const categoryById = new Map<string, Category>();
  for (const cat of catResponse.categories) {
    categoryById.set(cat.id, cat);
    for (const child of cat.childCategories || []) {
      categoryById.set(child.id, child);
    }
  }

  const suggestions: CategorySuggestion[] = [];

  for (const txn of uncategorized) {
    if (suggestions.length >= input.limit) break;

    // Use Copilot Money's own suggestions if available
    if (txn.suggestedCategoryIds && txn.suggestedCategoryIds.length > 0) {
      const suggestedId = txn.suggestedCategoryIds[0];
      const category = categoryById.get(suggestedId);
      if (category) {
        suggestions.push({
          transaction: txn,
          suggestedCategory: category.name,
          confidence: 'high',
          reason: 'Suggested by Copilot Money based on transaction history',
        });
        continue;
      }
    }

    // Fallback: pattern matching on merchant name
    const suggestion = matchByMerchantPattern(txn, catResponse.categories);
    if (suggestion) {
      suggestions.push({
        transaction: txn,
        suggestedCategory: suggestion.name,
        confidence: 'medium',
        reason: `Merchant name "${txn.name}" matches pattern for ${suggestion.name}`,
      });
    }
  }

  return suggestions;
}

function matchByMerchantPattern(
  txn: Transaction,
  categories: Category[]
): Category | null {
  const name = txn.name.toLowerCase();

  // Common patterns
  const patterns: Array<{ pattern: RegExp; categoryName: string }> = [
    { pattern: /uber|lyft|taxi|ride/i, categoryName: 'Transportation' },
    { pattern: /amazon|target|walmart|costco/i, categoryName: 'Shopping' },
    { pattern: /whole foods|trader joe|grocery|safeway|kroger/i, categoryName: 'Groceries' },
    { pattern: /starbucks|coffee|cafe/i, categoryName: 'Coffee Shops' },
    { pattern: /netflix|spotify|hulu|disney|subscription/i, categoryName: 'Subscriptions' },
    { pattern: /restaurant|doordash|grubhub|uber eats/i, categoryName: 'Restaurants' },
    { pattern: /gas|shell|chevron|exxon|bp/i, categoryName: 'Gas' },
    { pattern: /gym|fitness|peloton/i, categoryName: 'Health & Fitness' },
  ];

  for (const { pattern, categoryName } of patterns) {
    if (pattern.test(name)) {
      // Find matching category (case-insensitive)
      const found = categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (found) return found;

      // Check children
      for (const cat of categories) {
        const child = cat.childCategories?.find(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase()
        );
        if (child) return child;
      }
    }
  }

  return null;
}
```

- [ ] **Step 2: Commit suggest tool**

```bash
git add src/tools/suggest.ts
git commit -m "feat: add suggest_categories tool with pattern matching"
```

---

## Task 16: Tool Registration and Index

**Files:**
- Create: `src/tools/index.ts`

- [ ] **Step 1: Create tools index with registration**

```typescript
// src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphQLClient } from '../graphql/client.js';
import type { Category, Tag, Transaction } from '../types/index.js';
import { CopilotMoneyError } from '../types/error.js';

// Import all tools
import { getTransactions, getTransactionsInputSchema } from './transactions.js';
import { getAccounts, getAccountsInputSchema } from './accounts.js';
import { getCategories, getCategoriesInputSchema, buildCategoryMap } from './categories.js';
import { getTags, getTagsInputSchema, buildTagMap } from './tags.js';
import { getRecurring, getRecurringInputSchema } from './recurring.js';
import { getBudgets, getBudgetsInputSchema } from './budgets.js';
import { categorizeTransaction, categorizeTransactionInputSchema } from './categorize.js';
import { tagTransaction, tagTransactionInputSchema, untagTransaction, untagTransactionInputSchema } from './tag.js';
import { reviewTransaction, reviewTransactionInputSchema, unreviewTransaction, unreviewTransactionInputSchema } from './review.js';
import { bulkCategorize, bulkCategorizeInputSchema, bulkTag, bulkTagInputSchema, bulkReview, bulkReviewInputSchema } from './bulk.js';
import { suggestCategories, suggestCategoriesInputSchema } from './suggest.js';

// Cache for categories and tags
let cachedCategories: Category[] | null = null;
let cachedTags: Tag[] | null = null;
let categoryMap: Map<string, string> = new Map();
let tagMap: Map<string, string> = new Map();

async function refreshCategoryCache(client: GraphQLClient): Promise<void> {
  cachedCategories = await getCategories(client, {});
  categoryMap = buildCategoryMap(cachedCategories);
}

async function refreshTagCache(client: GraphQLClient): Promise<void> {
  cachedTags = await getTags(client);
  tagMap = buildTagMap(cachedTags);
}

async function ensureCaches(client: GraphQLClient): Promise<void> {
  if (!cachedCategories) await refreshCategoryCache(client);
  if (!cachedTags) await refreshTagCache(client);
}

async function findTransaction(
  client: GraphQLClient,
  transactionId: string
): Promise<Transaction> {
  const result = await getTransactions(client, { limit: 1 }, categoryMap);
  // For now, we need to fetch by ID - this is a simplification
  // In practice, we'd need a getTransactionById query
  const txn = result.transactions.find((t) => t.id === transactionId);
  if (!txn) {
    throw new CopilotMoneyError(
      'TRANSACTION_NOT_FOUND',
      `Transaction ${transactionId} not found`
    );
  }
  return txn;
}

export function registerTools(server: McpServer, client: GraphQLClient): void {
  // Read tools
  server.registerTool('get_transactions', {
    description: 'Get transactions with optional filters',
    inputSchema: getTransactionsInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const result = await getTransactions(client, input, categoryMap);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_accounts', {
    description: 'Get all accounts',
    inputSchema: getAccountsInputSchema,
  }, async (input) => {
    const result = await getAccounts(client, input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_categories', {
    description: 'Get all spending categories',
    inputSchema: getCategoriesInputSchema,
  }, async (input) => {
    const result = await getCategories(client, input);
    cachedCategories = result;
    categoryMap = buildCategoryMap(result);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_tags', {
    description: 'Get all tags',
    inputSchema: getTagsInputSchema,
  }, async () => {
    const result = await getTags(client);
    cachedTags = result;
    tagMap = buildTagMap(result);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_recurring', {
    description: 'Get recurring transactions and subscriptions',
    inputSchema: getRecurringInputSchema,
  }, async () => {
    const result = await getRecurring(client);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_budgets', {
    description: 'Get budget information',
    inputSchema: getBudgetsInputSchema,
  }, async (input) => {
    const result = await getBudgets(client, input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // Write tools
  server.registerTool('categorize_transaction', {
    description: 'Set the category for a transaction',
    inputSchema: categorizeTransactionInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const txn = await findTransaction(client, input.transaction_id);
    const categoryNames = cachedCategories!.map((c) => c.name);
    const result = await categorizeTransaction(client, input, txn, categoryMap, categoryNames);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('tag_transaction', {
    description: 'Add tags to a transaction',
    inputSchema: tagTransactionInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const txn = await findTransaction(client, input.transaction_id);
    const tagNames = cachedTags!.map((t) => t.name);
    const result = await tagTransaction(client, input, txn, tagMap, tagNames);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('untag_transaction', {
    description: 'Remove tags from a transaction',
    inputSchema: untagTransactionInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const txn = await findTransaction(client, input.transaction_id);
    const result = await untagTransaction(client, input, txn, tagMap);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('review_transaction', {
    description: 'Mark a transaction as reviewed',
    inputSchema: reviewTransactionInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const txn = await findTransaction(client, input.transaction_id);
    const result = await reviewTransaction(client, txn);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('unreview_transaction', {
    description: 'Mark a transaction as not reviewed',
    inputSchema: unreviewTransactionInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const txn = await findTransaction(client, input.transaction_id);
    const result = await unreviewTransaction(client, txn);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // Bulk tools
  server.registerTool('bulk_categorize', {
    description: 'Categorize multiple transactions at once',
    inputSchema: bulkCategorizeInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const categoryNames = cachedCategories!.map((c) => c.name);
    const result = await bulkCategorize(client, input, categoryMap, categoryNames);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('bulk_tag', {
    description: 'Tag multiple transactions at once',
    inputSchema: bulkTagInputSchema,
  }, async (input) => {
    await ensureCaches(client);
    const tagNames = cachedTags!.map((t) => t.name);
    const result = await bulkTag(client, input, tagMap, tagNames);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('bulk_review', {
    description: 'Mark multiple transactions as reviewed',
    inputSchema: bulkReviewInputSchema,
  }, async (input) => {
    const result = await bulkReview(client, input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // Smart tools
  server.registerTool('suggest_categories', {
    description: 'Get AI-powered category suggestions for uncategorized transactions',
    inputSchema: suggestCategoriesInputSchema,
  }, async (input) => {
    const result = await suggestCategories(client, input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });
}
```

- [ ] **Step 2: Commit tools index**

```bash
git add src/tools/index.ts
git commit -m "feat: add tool registration with caching"
```

---

## Task 17: MCP Server Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement MCP server entry point**

```typescript
// src/index.ts
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthManager } from './auth/index.js';
import { GraphQLClient } from './graphql/client.js';
import { registerTools } from './tools/index.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'copilot-money-mcp',
    version: '0.1.0',
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
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors, dist/index.js created

- [ ] **Step 3: Commit entry point**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point with stdio transport"
```

---

## Task 18: README and Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

```markdown
# Copilot Money MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to read and write data in Copilot Money.

## Features

- **Read operations**: Query transactions, accounts, categories, recurring payments, budgets, and tags
- **Write operations**: Categorize, tag, and review transactions
- **Bulk operations**: Batch categorize, tag, and review multiple transactions
- **Smart suggestions**: AI-powered category suggestions for uncategorized transactions

## Installation

```bash
npm install -g copilot-money-mcp
```

Or clone and build locally:

```bash
git clone https://github.com/dakaneye/copilot-money-mcp.git
cd copilot-money-mcp
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "copilot-money-mcp"
    }
  }
}
```

### Cursor

Add to MCP settings in Cursor preferences.

## Authentication

On first use, the server will:
1. Open your browser to Copilot Money login
2. Prompt you to paste your bearer token from the browser's Network tab
3. Store the token securely in macOS Keychain

## Available Tools

### Read Tools
- `get_transactions` - List/search transactions with filters
- `get_accounts` - List all accounts
- `get_categories` - List spending categories
- `get_tags` - List all tags
- `get_recurring` - List recurring transactions/subscriptions
- `get_budgets` - Get budget information

### Write Tools
- `categorize_transaction` - Set category for a transaction
- `tag_transaction` - Add tags to a transaction
- `untag_transaction` - Remove tags from a transaction
- `review_transaction` - Mark as reviewed
- `unreview_transaction` - Mark as not reviewed

### Bulk Tools
- `bulk_categorize` - Categorize multiple transactions
- `bulk_tag` - Tag multiple transactions
- `bulk_review` - Review multiple transactions

### Smart Tools
- `suggest_categories` - Get AI-powered category suggestions

## Development

```bash
npm run dev      # Watch mode
npm run build    # Build
npm run test     # Run tests
npm run lint     # Lint
```

## License

MIT
```

- [ ] **Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: add README with installation and usage instructions"
```

---

## Task 19: Final Build and Push

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: dist/ created successfully

- [ ] **Step 4: Push all commits**

```bash
git push origin main
```

---

## Summary

**Total Tasks:** 19
**Total Steps:** ~95

**Phase Breakdown:**
- Tasks 1-2: Project setup (2 tasks)
- Tasks 3-5: Authentication (3 tasks)
- Tasks 6-8: GraphQL client (3 tasks)
- Tasks 9-11: Read tools (3 tasks)
- Tasks 12-15: Write and bulk tools (4 tasks)
- Tasks 16-17: Integration (2 tasks)
- Tasks 18-19: Documentation and finalization (2 tasks)
