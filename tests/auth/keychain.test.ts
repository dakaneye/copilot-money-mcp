import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import type { KeychainDeps } from '../../src/auth/keychain.js';

async function createKeychainWithMock(mockKeytar: KeychainDeps) {
  const mod = await import('../../src/auth/keychain.js');
  return mod.createKeychain(mockKeytar);
}

describe('keychain - token storage', () => {
  test('storeToken saves token as JSON', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.storeToken({ token: 'abc123', expiresAt: 1711562400000 });

    assert.strictEqual(mockKeytar.setPassword.mock.callCount(), 1);
    const args = mockKeytar.setPassword.mock.calls[0]?.arguments ?? [];
    const [service, account, value] = args as unknown as [string, string, string];
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'token');
    const parsed = JSON.parse(value);
    assert.strictEqual(parsed.token, 'abc123');
    assert.strictEqual(parsed.expiresAt, 1711562400000);
  });

  test('getToken returns parsed token', async () => {
    const storedValue = JSON.stringify({ token: 'xyz789', expiresAt: 1711562400000 });
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn((service: string, account: string) => {
        if (account === 'token') return Promise.resolve(storedValue);
        return Promise.resolve(null);
      }),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getToken();

    assert.deepStrictEqual(result, { token: 'xyz789', expiresAt: 1711562400000 });
  });

  test('getToken returns null when not stored', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getToken();

    assert.strictEqual(result, null);
  });

  test('clearToken removes token', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.clearToken();

    assert.strictEqual(mockKeytar.deletePassword.mock.calls.length, 1);
  });
});

describe('keychain - credentials storage', () => {
  test('storeCredentials saves email and password', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.storeCredentials({ email: 'test@example.com', password: 'secret123' });

    assert.strictEqual(mockKeytar.setPassword.mock.callCount(), 1);
    const args = mockKeytar.setPassword.mock.calls[0]?.arguments ?? [];
    const [service, account, value] = args as unknown as [string, string, string];
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'credentials');
    const parsed = JSON.parse(value);
    assert.strictEqual(parsed.email, 'test@example.com');
    assert.strictEqual(parsed.password, 'secret123');
  });

  test('getCredentials returns stored credentials', async () => {
    const storedValue = JSON.stringify({ email: 'test@example.com', password: 'secret123' });
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn((service: string, account: string) => {
        if (account === 'credentials') return Promise.resolve(storedValue);
        return Promise.resolve(null);
      }),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getCredentials();

    assert.deepStrictEqual(result, { email: 'test@example.com', password: 'secret123' });
  });
});

describe('keychain - isTokenExpired', () => {
  test('returns true when token expires within 10 minutes', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const token = { token: 'test', expiresAt: Date.now() + 5 * 60 * 1000 }; // 5 min

    assert.strictEqual(keychain.isTokenExpired(token), true);
  });

  test('returns false when token has more than 10 minutes left', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const token = { token: 'test', expiresAt: Date.now() + 30 * 60 * 1000 }; // 30 min

    assert.strictEqual(keychain.isTokenExpired(token), false);
  });
});
