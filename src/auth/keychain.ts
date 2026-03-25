import keytar from 'keytar';

const SERVICE_NAME = 'copilot-money-mcp';
const ACCOUNT_ACCESS = 'access_token';
const ACCOUNT_REFRESH = 'refresh_token';
const ACCOUNT_EXPIRES = 'expires_at';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, expiresAtStr] = await Promise.all([
    keytar.getPassword(SERVICE_NAME, ACCOUNT_ACCESS),
    keytar.getPassword(SERVICE_NAME, ACCOUNT_REFRESH),
    keytar.getPassword(SERVICE_NAME, ACCOUNT_EXPIRES),
  ]);

  if (!accessToken) {
    return null;
  }

  let expiresAt: number | null = null;
  if (expiresAtStr) {
    const parsed = parseInt(expiresAtStr, 10);
    expiresAt = Number.isNaN(parsed) ? null : parsed;
  }

  return { accessToken, refreshToken, expiresAt };
}

async function safeDeletePassword(account: string): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, account);
  } catch (error) {
    // Ignore "not found" errors, log unexpected ones
    if (error instanceof Error && !error.message.includes('not found')) {
      console.error(`Failed to delete ${account}:`, error.message);
    }
  }
}

export async function storeTokens(tokens: StoredTokens): Promise<void> {
  if (!tokens.accessToken || tokens.accessToken.trim() === '') {
    throw new Error('accessToken cannot be empty');
  }

  await keytar.setPassword(SERVICE_NAME, ACCOUNT_ACCESS, tokens.accessToken);

  if (tokens.refreshToken) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_REFRESH, tokens.refreshToken);
  } else {
    await safeDeletePassword(ACCOUNT_REFRESH);
  }

  if (tokens.expiresAt) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_EXPIRES, tokens.expiresAt.toString());
  } else {
    await safeDeletePassword(ACCOUNT_EXPIRES);
  }
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    safeDeletePassword(ACCOUNT_ACCESS),
    safeDeletePassword(ACCOUNT_REFRESH),
    safeDeletePassword(ACCOUNT_EXPIRES),
  ]);
}

export function isTokenExpired(expiresAt: number | null): boolean {
  if (!expiresAt) {
    return false;
  }
  // Consider expired if within 5 minutes of expiry
  const EXPIRY_BUFFER = 5 * 60 * 1000;
  return Date.now() > expiresAt - EXPIRY_BUFFER;
}
