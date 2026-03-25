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
