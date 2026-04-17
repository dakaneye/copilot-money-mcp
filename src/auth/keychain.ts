import keytar from 'keytar';

const SERVICE_NAME = 'copilot-money-auth';
const ACCOUNT_TOKEN = 'token';
const ACCOUNT_CREDENTIALS = 'credentials';

export interface StoredToken {
  token: string;
  expiresAt: number;
  email: string;
  refreshToken: string;
}

export interface KeychainDeps {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
}

const defaultDeps: KeychainDeps = {
  setPassword: keytar.setPassword.bind(keytar),
  getPassword: keytar.getPassword.bind(keytar),
  deletePassword: keytar.deletePassword.bind(keytar),
};

export function createKeychain(deps: KeychainDeps = defaultDeps) {
  async function setToken(token: StoredToken): Promise<void> {
    await deps.setPassword(SERVICE_NAME, ACCOUNT_TOKEN, JSON.stringify(token));
  }

  async function getToken(): Promise<StoredToken | null> {
    const value = await deps.getPassword(SERVICE_NAME, ACCOUNT_TOKEN);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<StoredToken>;
      if (
        typeof parsed.token !== 'string' ||
        typeof parsed.expiresAt !== 'number' ||
        typeof parsed.email !== 'string' ||
        typeof parsed.refreshToken !== 'string'
      ) {
        return null;
      }
      return parsed as StoredToken;
    } catch {
      return null;
    }
  }

  async function clearToken(): Promise<void> {
    try {
      await deps.deletePassword(SERVICE_NAME, ACCOUNT_TOKEN);
    } catch {
      // Ignore errors - may not exist
    }
  }

  async function clearCredentials(): Promise<void> {
    // Delete both token and legacy credentials entry (migration path).
    // Swallow errors individually so one missing entry doesn't prevent the other.
    try {
      await deps.deletePassword(SERVICE_NAME, ACCOUNT_TOKEN);
    } catch {
      // Ignore errors - may not exist
    }
    try {
      await deps.deletePassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
    } catch {
      // Ignore errors - may not exist
    }
  }

  return {
    setToken,
    getToken,
    clearToken,
    clearCredentials,
  };
}

// Default instance for convenience
const defaultKeychain = createKeychain();

export const setToken = defaultKeychain.setToken;
export const getToken = defaultKeychain.getToken;
export const clearToken = defaultKeychain.clearToken;
export const clearCredentials = defaultKeychain.clearCredentials;
