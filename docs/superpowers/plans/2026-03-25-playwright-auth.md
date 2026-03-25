# Playwright Auth Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual token copy/paste with Playwright browser automation that captures the auth token automatically, with email-link fallback.

**Architecture:** Playwright launches Chromium, intercepts Authorization header from GraphQL requests after user logs in. If Playwright unavailable, fall back to email-link mode where user pastes the magic link URL and Firebase SDK exchanges it for a token.

**Tech Stack:** Playwright (optional dep), Firebase SDK, Node.js readline

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/auth/playwright.ts` | Playwright browser automation and token capture |
| `src/auth/email-link.ts` | Firebase email-link authentication fallback |
| `src/auth/index.ts` | Auth exports (add new modules) |
| `src/index.ts` | Updated `runLogin()` with Playwright + fallback flow |
| `package.json` | Add firebase dep, playwright as optional |

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add firebase and playwright dependencies**

```bash
npm install firebase
npm install --save-optional playwright
```

- [ ] **Step 2: Verify package.json updated**

Run: `cat package.json | grep -A2 firebase`
Expected: Shows firebase in dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add firebase and playwright dependencies"
```

---

## Task 2: Create Playwright auth module

**Files:**
- Create: `src/auth/playwright.ts`

- [ ] **Step 1: Create playwright.ts**

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const COPILOT_URL = 'https://app.copilot.money';
const GRAPHQL_URL = 'https://app.copilot.money/api/graphql';
const SESSION_DIR = join(homedir(), '.config', 'copilot-money-mcp', 'browser-session');

export interface PlaywrightAuthResult {
  token: string;
  expiresAt: number | null;
}

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

export async function isPlaywrightAvailable(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

export async function captureTokenWithPlaywright(): Promise<PlaywrightAuthResult> {
  const { chromium } = await import('playwright');

  await mkdir(SESSION_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = await context.newPage();

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        context.close().catch(() => {});
        reject(new Error('Login timed out after 5 minutes'));
      }
    }, 5 * 60 * 1000);

    page.on('request', (request) => {
      if (resolved) return;

      const url = request.url();
      if (url.startsWith(GRAPHQL_URL)) {
        const authHeader = request.headers()['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          resolved = true;
          clearTimeout(timeout);

          const token = authHeader.slice(7);
          const expiresAt = parseJwtExpiry(token);

          context.close().catch(() => {});
          resolve({ token, expiresAt });
        }
      }
    });

    page.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        context.close().catch(() => {});
        reject(new Error('Browser closed before authentication completed'));
      }
    });

    page.goto(COPILOT_URL).catch((err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        context.close().catch(() => {});
        reject(err);
      }
    });
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS (playwright is optional, dynamic import handles missing dep)

- [ ] **Step 3: Commit**

```bash
git add src/auth/playwright.ts
git commit -m "feat: add Playwright auth module for token capture"
```

---

## Task 3: Create email-link auth module

**Files:**
- Create: `src/auth/email-link.ts`

- [ ] **Step 1: Create email-link.ts**

```typescript
import * as readline from 'node:readline';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAYnMKo4GNJs8Rl2F--c4VCb5LKrOAzxng',
  authDomain: 'copilot-production-22904.firebaseapp.com',
  projectId: 'copilot-production-22904',
};

export interface EmailLinkAuthResult {
  token: string;
  expiresAt: number | null;
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function captureTokenWithEmailLink(): Promise<EmailLinkAuthResult> {
  const email = await prompt('Enter your Copilot Money email: ');
  if (!email) {
    throw new Error('Email is required');
  }

  console.log('\nCheck your email for the Copilot Money magic link.');
  console.log('After clicking the link, copy the FULL URL from your browser address bar.');
  console.log('(It should start with https://app.copilot.money/...)\n');

  const magicLink = await prompt('Paste the magic link URL: ');
  if (!magicLink) {
    throw new Error('Magic link URL is required');
  }

  let app: FirebaseApp | null = null;
  try {
    app = initializeApp(FIREBASE_CONFIG, 'copilot-money-mcp-auth');
    const auth = getAuth(app);

    if (!isSignInWithEmailLink(auth, magicLink)) {
      throw new Error('Invalid magic link URL. Please copy the full URL from your browser.');
    }

    const result = await signInWithEmailLink(auth, email, magicLink);
    const token = await result.user.getIdToken();

    const expiresAt = result.user.metadata.lastSignInTime
      ? new Date(result.user.metadata.lastSignInTime).getTime() + 60 * 60 * 1000
      : null;

    return { token, expiresAt };
  } finally {
    if (app) {
      await deleteApp(app);
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/auth/email-link.ts
git commit -m "feat: add email-link auth module for Firebase magic link flow"
```

---

## Task 4: Update auth exports

**Files:**
- Modify: `src/auth/index.ts`

- [ ] **Step 1: Update auth/index.ts**

Replace contents of `src/auth/index.ts`:

```typescript
export { AuthManager, getAuthManager } from './manager.js';
export { getStoredTokens, storeTokens, clearTokens } from './keychain.js';
export { isPlaywrightAvailable, captureTokenWithPlaywright } from './playwright.js';
export { captureTokenWithEmailLink } from './email-link.js';
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/auth/index.ts
git commit -m "chore: export new auth modules"
```

---

## Task 5: Update runLogin with Playwright + fallback

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update imports in index.ts**

Replace the import line (line 7):

```typescript
import {
  getAuthManager,
  getStoredTokens,
  storeTokens,
  clearTokens,
  isPlaywrightAvailable,
  captureTokenWithPlaywright,
  captureTokenWithEmailLink,
} from './auth/index.js';
```

- [ ] **Step 2: Remove old helper functions**

Remove these functions from index.ts (they're now in auth modules or no longer needed):
- `parseJwtExpiry` (lines 11-20) - now in playwright.ts
- `promptForToken` (lines 49-61) - replaced by new flow
- `openBrowser` (lines 38-47) - no longer needed

Keep `formatTimeRemaining` (lines 22-36) - still used for status display.

- [ ] **Step 3: Replace runLogin function**

Replace the `runLogin` function with:

```typescript
async function runLogin(): Promise<void> {
  const noBrowser = process.argv.includes('--no-browser');

  if (!noBrowser && await isPlaywrightAvailable()) {
    console.log('\nLaunching browser for Copilot Money login...');
    console.log('Log in normally. The token will be captured automatically.\n');

    try {
      const result = await captureTokenWithPlaywright();
      await storeTokens({
        accessToken: result.token,
        refreshToken: null,
        expiresAt: result.expiresAt,
      });

      if (result.expiresAt) {
        console.log(`\nLogin successful (${formatTimeRemaining(result.expiresAt)}). Token stored in keychain.`);
      } else {
        console.log('\nLogin successful. Token stored in keychain.');
      }
      return;
    } catch (error) {
      console.error(`\nBrowser login failed: ${error instanceof Error ? error.message : error}`);
      console.log('Falling back to email-link mode...\n');
    }
  }

  // Fallback: email-link mode
  if (!await isPlaywrightAvailable() && !noBrowser) {
    console.log('\nPlaywright not installed. Using email-link mode.');
    console.log('For automatic browser login, run: npx playwright install chromium\n');
  }

  try {
    const result = await captureTokenWithEmailLink();
    await storeTokens({
      accessToken: result.token,
      refreshToken: null,
      expiresAt: result.expiresAt,
    });

    if (result.expiresAt) {
      console.log(`\nLogin successful (${formatTimeRemaining(result.expiresAt)}). Token stored in keychain.`);
    } else {
      console.log('\nLogin successful. Token stored in keychain.');
    }
  } catch (error) {
    console.error(`\nLogin failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Update help text**

Update the help case to include `--no-browser`:

```typescript
    case 'help':
    case '--help':
    case '-h':
      console.log(`Usage: copilot-money-mcp [command] [options]

Commands:
  login     Authenticate with Copilot Money
  logout    Clear stored token
  status    Check token status
  (none)    Run MCP server

Options:
  --no-browser    Skip browser automation, use email-link mode
`);
      break;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: integrate Playwright login with email-link fallback"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Test help command**

```bash
node dist/index.js help
```

Expected: Shows updated help with `--no-browser` option

- [ ] **Step 2: Install Playwright Chromium**

```bash
npx playwright install chromium
```

- [ ] **Step 3: Test Playwright login**

```bash
node dist/index.js logout
node dist/index.js login
```

Expected: Browser opens, you log in, token captured automatically

- [ ] **Step 4: Verify token stored**

```bash
node dist/index.js status
```

Expected: Shows valid token with expiry

- [ ] **Step 5: Test email-link fallback**

```bash
node dist/index.js logout
node dist/index.js login --no-browser
```

Expected: Prompts for email, then magic link URL

- [ ] **Step 6: Test MCP server still works**

Verify MCP tools work in Claude Code with stored token.

- [ ] **Step 7: Push changes**

```bash
git push origin main
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add firebase and playwright dependencies |
| 2 | Create Playwright auth module |
| 3 | Create email-link auth module |
| 4 | Update auth exports |
| 5 | Update runLogin with Playwright + fallback |
| 6 | Manual verification |

**Total steps:** 23
