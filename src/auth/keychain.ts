import keytar from 'keytar';

const SERVICE_NAME = 'copilot-money-auth';
const ACCOUNT_TOKEN = 'token';
const ACCOUNT_CREDENTIALS = 'credentials';

export interface StoredToken {
  token: string;
  expiresAt: number;
}

export interface StoredCredentials {
  email: string;
  password: string;
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
  async function storeToken(token: StoredToken): Promise<void> {
    const value = JSON.stringify(token);
    await deps.setPassword(SERVICE_NAME, ACCOUNT_TOKEN, value);
  }

  async function getToken(): Promise<StoredToken | null> {
    const value = await deps.getPassword(SERVICE_NAME, ACCOUNT_TOKEN);
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredToken;
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

  async function storeCredentials(creds: StoredCredentials): Promise<void> {
    const value = JSON.stringify(creds);
    await deps.setPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS, value);
  }

  async function getCredentials(): Promise<StoredCredentials | null> {
    const value = await deps.getPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredCredentials;
    } catch {
      return null;
    }
  }

  async function clearCredentials(): Promise<void> {
    try {
      await deps.deletePassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
    } catch {
      // Ignore errors - may not exist
    }
  }

  async function clearAll(): Promise<void> {
    await Promise.all([clearToken(), clearCredentials()]);
  }

  function isTokenExpired(token: StoredToken): boolean {
    const BUFFER_MS = 10 * 60 * 1000; // 10 minutes before expiry
    return Date.now() > token.expiresAt - BUFFER_MS;
  }

  return {
    storeToken,
    getToken,
    clearToken,
    storeCredentials,
    getCredentials,
    clearCredentials,
    clearAll,
    isTokenExpired,
  };
}

// Default instance for convenience
const defaultKeychain = createKeychain();

export const storeToken = defaultKeychain.storeToken;
export const getToken = defaultKeychain.getToken;
export const clearToken = defaultKeychain.clearToken;
export const storeCredentials = defaultKeychain.storeCredentials;
export const getCredentials = defaultKeychain.getCredentials;
export const clearCredentials = defaultKeychain.clearCredentials;
export const clearAll = defaultKeychain.clearAll;
export const isTokenExpired = defaultKeychain.isTokenExpired;
