import { CopilotMoneyError } from '../types/error.js';

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export interface KeychainPort {
  getToken(): Promise<{
    token: string;
    expiresAt: number;
    email: string;
    refreshToken: string;
  } | null>;
  setToken(v: {
    token: string;
    expiresAt: number;
    email: string;
    refreshToken: string;
  }): Promise<void>;
  clearCredentials(): Promise<void>;
}

export interface AuthManager {
  getToken(): Promise<string>;
  setToken(v: {
    token: string;
    expiresAt: number;
    email: string;
    refreshToken: string;
  }): Promise<void>;
  logout(): Promise<void>;
  getEmail(): Promise<string | null>;
}

export function createAuthManager(deps: { keychain: KeychainPort }): AuthManager {
  const { keychain } = deps;
  return {
    async getToken() {
      const stored = await keychain.getToken();
      if (!stored) {
        throw new CopilotMoneyError(
          'NOT_AUTHENTICATED',
          'Not logged in. Run `copilot-auth login`.'
        );
      }
      if (stored.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= Date.now()) {
        throw new CopilotMoneyError(
          'TOKEN_EXPIRED',
          'Authentication expired. Run `copilot-auth login` in your terminal, then retry.'
        );
      }
      return stored.token;
    },
    setToken: (v) => keychain.setToken(v),
    logout: () => keychain.clearCredentials(),
    async getEmail() {
      const stored = await keychain.getToken();
      return stored?.email ?? null;
    },
  };
}
