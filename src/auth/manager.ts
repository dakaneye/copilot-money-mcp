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
