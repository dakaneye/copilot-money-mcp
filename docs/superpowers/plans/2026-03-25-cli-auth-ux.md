# CLI Auth UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `login`, `logout`, and `status` subcommands to `copilot-money-mcp` for explicit auth management, replacing the confusing auto-auth flow.

**Architecture:** Subcommand routing in index.ts dispatches to CLI functions (login/logout/status) or runs the MCP server (default). Auth manager throws clear errors instead of auto-launching browser auth.

**Tech Stack:** Node.js, keytar (keychain), readline (prompts), execFile (open browser)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/index.ts` | Entry point with subcommand routing + CLI functions |
| `src/auth/manager.ts` | Token lifecycle (no auto-auth) |
| `src/auth/keychain.ts` | Keychain storage (unchanged) |
| `src/auth/index.ts` | Auth exports (remove browser.ts export) |
| `src/auth/browser.ts` | **DELETE** - unused callback server |

---

## Task 1: Remove browser.ts and update exports

**Files:**
- Delete: `src/auth/browser.ts`
- Modify: `src/auth/index.ts`

- [ ] **Step 1: Delete browser.ts**

```bash
rm src/auth/browser.ts
```

- [ ] **Step 2: Update auth/index.ts exports**

Replace contents of `src/auth/index.ts`:

```typescript
export { AuthManager, getAuthManager } from './manager.js';
export { getStoredTokens, storeTokens, clearTokens } from './keychain.js';
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build fails (manager.ts still imports browser.ts)

- [ ] **Step 4: Commit deletion**

```bash
git add -A
git commit -m "chore: remove unused browser auth module"
```

---

## Task 2: Update AuthManager to remove auto-auth

**Files:**
- Modify: `src/auth/manager.ts`

- [ ] **Step 1: Update manager.ts**

Replace contents of `src/auth/manager.ts`:

```typescript
import { getStoredTokens, storeTokens, clearTokens, isTokenExpired } from './keychain.js';
import { CopilotMoneyError } from '../types/error.js';

export class AuthManager {
  private cachedToken: string | null = null;

  async getAccessToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }

    const stored = await getStoredTokens();
    if (stored && !isTokenExpired(stored.expiresAt)) {
      this.cachedToken = stored.accessToken;
      return stored.accessToken;
    }

    throw new CopilotMoneyError(
      'NOT_AUTHENTICATED',
      "Not authenticated. Run 'copilot-money-mcp login' to set up authentication."
    );
  }

  async ensureAuthenticated(): Promise<string> {
    return this.getAccessToken();
  }

  async handleAuthError(): Promise<string> {
    this.cachedToken = null;
    await clearTokens();
    throw new CopilotMoneyError(
      'NOT_AUTHENTICATED',
      "Session expired. Run 'copilot-money-mcp login' to re-authenticate."
    );
  }

  async logout(): Promise<void> {
    this.cachedToken = null;
    await clearTokens();
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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/auth/manager.ts
git commit -m "refactor: remove auto-auth, throw clear error instead"
```

---

## Task 3: Add CLI subcommands to index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace index.ts with subcommand routing**

Replace contents of `src/index.ts`:

```typescript
#!/usr/bin/env node

import { execFile } from 'node:child_process';
import * as readline from 'node:readline';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthManager, getStoredTokens, storeTokens, clearTokens } from './auth/index.js';
import { GraphQLClient } from './graphql/client.js';
import { registerTools } from './tools/index.js';

function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function formatTimeRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
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

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' :
              'xdg-open';
  execFile(cmd, [url], (error) => {
    if (error) {
      console.error(`Please open this URL manually: ${url}`);
    }
  });
}

async function promptForToken(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Token: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runLogin(): Promise<void> {
  console.log('\nOpening Copilot Money in your browser...\n');
  openBrowser('https://app.copilot.money');

  console.log('To get your authentication token:');
  console.log('1. Log in to Copilot Money in your browser');
  console.log('2. Open DevTools (Cmd+Option+I) → Network tab');
  console.log('3. Click any request → Headers → copy "Authorization: Bearer ..." value');
  console.log('4. Paste the token below (without "Bearer " prefix)\n');

  const token = await promptForToken();

  if (!token) {
    console.error('No token provided.');
    process.exit(1);
  }

  if (token.startsWith('Bearer ')) {
    console.error('Please paste only the token, without "Bearer " prefix.');
    process.exit(1);
  }

  const expiresAt = parseJwtExpiry(token);
  if (expiresAt && expiresAt < Date.now()) {
    console.error('This token is already expired. Please get a fresh token.');
    process.exit(1);
  }

  await storeTokens({
    accessToken: token,
    refreshToken: null,
    expiresAt,
  });

  if (expiresAt) {
    const remaining = formatTimeRemaining(expiresAt);
    console.log(`\nToken valid (${remaining}). Stored in keychain.`);
  } else {
    console.log('\nToken stored in keychain.');
  }
}

async function runLogout(): Promise<void> {
  await clearTokens();
  console.log('Token cleared from keychain.');
}

async function runStatus(): Promise<void> {
  const stored = await getStoredTokens();

  if (!stored) {
    console.log('Token: not configured');
    console.log("\nRun 'copilot-money-mcp login' to set up authentication.");
    return;
  }

  if (stored.expiresAt) {
    const now = Date.now();
    if (now > stored.expiresAt) {
      console.log(`Token: ${formatTimeRemaining(stored.expiresAt)}`);
      console.log("\nRun 'copilot-money-mcp login' to refresh.");
    } else {
      console.log(`Token: valid (${formatTimeRemaining(stored.expiresAt)})`);
    }
  } else {
    console.log('Token: configured (no expiry info)');
  }
}

async function runServer(): Promise<void> {
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

async function main(): Promise<void> {
  const command = process.argv[2];

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
    case 'help':
    case '--help':
    case '-h':
      console.log(`Usage: copilot-money-mcp [command]

Commands:
  login     Store authentication token
  logout    Clear stored token
  status    Check token status
  (none)    Run MCP server
`);
      break;
    default:
      await runServer();
      break;
  }
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add login/logout/status CLI subcommands"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Clear existing token**

```bash
node dist/index.js logout
```

Expected: `Token cleared from keychain.`

- [ ] **Step 2: Check status (no token)**

```bash
node dist/index.js status
```

Expected:
```
Token: not configured

Run 'copilot-money-mcp login' to set up authentication.
```

- [ ] **Step 3: Test login flow**

```bash
node dist/index.js login
```

Expected: Opens browser, prompts for token, stores it with expiry info.

- [ ] **Step 4: Check status (valid token)**

```bash
node dist/index.js status
```

Expected: `Token: valid (expires in X minutes)`

- [ ] **Step 5: Test help**

```bash
node dist/index.js help
```

Expected: Shows usage information.

- [ ] **Step 6: Verify MCP server still works**

Test via Claude Code that the MCP tools work with the stored token.

- [ ] **Step 7: Push changes**

```bash
git push origin main
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Remove unused browser.ts |
| 2 | Update AuthManager to throw errors instead of auto-auth |
| 3 | Add CLI subcommands to index.ts |
| 4 | Manual verification |

**Total steps:** 15
