import { getStoredTokens, clearTokens, isTokenExpired } from './keychain.js';
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
