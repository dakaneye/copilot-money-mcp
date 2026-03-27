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
