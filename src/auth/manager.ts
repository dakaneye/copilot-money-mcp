import {
  getToken as defaultGetToken,
  clearAll as defaultClearAll,
  isTokenExpired as defaultIsTokenExpired,
  type StoredToken,
} from './keychain.js';
import { CopilotMoneyError } from '../types/error.js';

export interface KeychainDeps {
  getToken: () => Promise<StoredToken | null>;
  clearAll: () => Promise<void>;
  isTokenExpired: (token: StoredToken) => boolean;
}

const defaultDeps: KeychainDeps = {
  getToken: defaultGetToken,
  clearAll: defaultClearAll,
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

    const stored = await this.deps.getToken();
    if (stored && !this.deps.isTokenExpired(stored)) {
      this.cachedToken = stored.token;
      return stored.token;
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
    await this.deps.clearAll();
    throw new CopilotMoneyError(
      'NOT_AUTHENTICATED',
      "Session expired. Run 'copilot-money-mcp login' to re-authenticate."
    );
  }

  async logout(): Promise<void> {
    this.cachedToken = null;
    await this.deps.clearAll();
  }
}

let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
