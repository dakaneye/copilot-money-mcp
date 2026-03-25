import {
  getStoredTokens as defaultGetStoredTokens,
  clearTokens as defaultClearTokens,
  isTokenExpired as defaultIsTokenExpired,
  type StoredTokens,
} from './keychain.js';
import { CopilotMoneyError } from '../types/error.js';

export interface KeychainDeps {
  getStoredTokens: () => Promise<StoredTokens | null>;
  clearTokens: () => Promise<void>;
  isTokenExpired: (expiresAt: number | null) => boolean;
}

const defaultDeps: KeychainDeps = {
  getStoredTokens: defaultGetStoredTokens,
  clearTokens: defaultClearTokens,
  isTokenExpired: defaultIsTokenExpired,
};

export class AuthManager {
  private cachedToken: string | null = null;
  private deps: KeychainDeps;

  constructor(deps: KeychainDeps = defaultDeps) {
    this.deps = deps;
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }

    const stored = await this.deps.getStoredTokens();
    if (stored && !this.deps.isTokenExpired(stored.expiresAt)) {
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
    await this.deps.clearTokens();
    throw new CopilotMoneyError(
      'NOT_AUTHENTICATED',
      "Session expired. Run 'copilot-money-mcp login' to re-authenticate."
    );
  }

  async logout(): Promise<void> {
    this.cachedToken = null;
    await this.deps.clearTokens();
  }
}

let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
