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
  const accessToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_ACCESS);
  if (!accessToken) {
    return null;
  }

  const refreshToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_REFRESH);
  const expiresAtStr = await keytar.getPassword(SERVICE_NAME, ACCOUNT_EXPIRES);
  let expiresAt: number | null = null;
  if (expiresAtStr) {
    const parsed = parseInt(expiresAtStr, 10);
    expiresAt = Number.isNaN(parsed) ? null : parsed;
  }

  return { accessToken, refreshToken, expiresAt };
}

export async function storeTokens(tokens: StoredTokens): Promise<void> {
  if (!tokens.accessToken || tokens.accessToken.trim() === '') {
    throw new Error('accessToken cannot be empty');
  }

  await keytar.setPassword(SERVICE_NAME, ACCOUNT_ACCESS, tokens.accessToken);

  if (tokens.refreshToken) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_REFRESH, tokens.refreshToken);
  } else {
    // Clear refresh token if not provided
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_REFRESH);
    } catch (error) {
      // Ignore if key doesn't exist, but log unexpected errors
      if (error instanceof Error && !error.message.includes('not found')) {
        console.error('Failed to delete refresh token:', error);
      }
    }
  }

  if (tokens.expiresAt) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_EXPIRES, tokens.expiresAt.toString());
  } else {
    // Clear expiration if not provided
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_EXPIRES);
    } catch (error) {
      // Ignore if key doesn't exist, but log unexpected errors
      if (error instanceof Error && !error.message.includes('not found')) {
        console.error('Failed to delete expiration time:', error);
      }
    }
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_ACCESS);
  } catch (error) {
    // Ignore if key doesn't exist, but log unexpected errors
    if (error instanceof Error && !error.message.includes('not found')) {
      console.error('Failed to delete access token:', error);
    }
  }

  try {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_REFRESH);
  } catch (error) {
    // Ignore if key doesn't exist, but log unexpected errors
    if (error instanceof Error && !error.message.includes('not found')) {
      console.error('Failed to delete refresh token:', error);
    }
  }

  try {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_EXPIRES);
  } catch (error) {
    // Ignore if key doesn't exist, but log unexpected errors
    if (error instanceof Error && !error.message.includes('not found')) {
      console.error('Failed to delete expiration time:', error);
    }
  }
}

export function isTokenExpired(expiresAt: number | null): boolean {
  if (!expiresAt) {
    return false;
  }
  // Consider expired if within 5 minutes of expiry
  const EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes in milliseconds
  return Date.now() > expiresAt - EXPIRY_BUFFER;
}
