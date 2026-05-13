import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import type { KeychainDeps } from '../../src/auth/keychain.js';

async function createKeychainWithMock(mockKeytar: KeychainDeps) {
  const mod = await import('../../src/auth/keychain.js');
  return mod.createKeychain(mockKeytar);
}

describe('keychain - token storage', () => {
  test('setToken saves 4-field token as JSON under account "token"', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.setToken({
      token: 'abc123',
      expiresAt: 1711562400000,
      email: 'test@example.com',
      refreshToken: 'refresh-xyz',
    });

    assert.strictEqual(mockKeytar.setPassword.mock.callCount(), 1);
    const args = mockKeytar.setPassword.mock.calls[0]?.arguments ?? [];
    const [service, account, value] = args as unknown as [string, string, string];
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'token');
    const parsed = JSON.parse(value);
    assert.strictEqual(parsed.token, 'abc123');
    assert.strictEqual(parsed.expiresAt, 1711562400000);
    assert.strictEqual(parsed.email, 'test@example.com');
    assert.strictEqual(parsed.refreshToken, 'refresh-xyz');
  });

  test('getToken returns the full 4-field shape', async () => {
    const storedValue = JSON.stringify({
      token: 'xyz789',
      expiresAt: 1711562400000,
      email: 'me@example.com',
      refreshToken: 'rt-42',
    });
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

    assert.deepStrictEqual(result, {
      token: 'xyz789',
      expiresAt: 1711562400000,
      email: 'me@example.com',
      refreshToken: 'rt-42',
    });
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

  test('getToken returns null when stored JSON lacks required fields', async () => {
    // Legacy records (e.g. {token, expiresAt} only) should fail validation and
    // be treated as missing, prompting re-login.
    const legacyValue = JSON.stringify({ token: 'legacy', expiresAt: 123 });
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(legacyValue)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    const result = await keychain.getToken();

    assert.strictEqual(result, null);
  });

  test('clearToken deletes the token entry', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.clearToken();

    assert.strictEqual(mockKeytar.deletePassword.mock.calls.length, 1);
    const args = mockKeytar.deletePassword.mock.calls[0]?.arguments ?? [];
    const [service, account] = args as unknown as [string, string];
    assert.strictEqual(service, 'copilot-money-auth');
    assert.strictEqual(account, 'token');
  });
});

describe('keychain - clearCredentials (migration path)', () => {
  test('clearCredentials deletes BOTH token and legacy credentials entries', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.resolve(true)),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    await keychain.clearCredentials();

    assert.strictEqual(mockKeytar.deletePassword.mock.calls.length, 2);
    const accounts = mockKeytar.deletePassword.mock.calls.map((call) => {
      const args = call.arguments as unknown as [string, string];
      return args[1];
    });
    assert.ok(accounts.includes('token'), 'should delete token entry');
    assert.ok(accounts.includes('credentials'), 'should delete legacy credentials entry');
  });

  test('clearCredentials swallows errors from either delete', async () => {
    const mockKeytar = {
      setPassword: mock.fn(() => Promise.resolve()),
      getPassword: mock.fn(() => Promise.resolve(null)),
      deletePassword: mock.fn(() => Promise.reject(new Error('nope'))),
    };

    const keychain = await createKeychainWithMock(mockKeytar);
    // Should not throw even though both deletes reject.
    await keychain.clearCredentials();
    assert.strictEqual(mockKeytar.deletePassword.mock.calls.length, 2);
  });
});

describe('keychain - removed legacy exports', () => {
  test('module no longer exports storeToken, storeCredentials, getCredentials, clearAll, isTokenExpired', async () => {
    const mod = (await import('../../src/auth/keychain.js')) as unknown as Record<string, unknown>;
    assert.strictEqual(mod.storeToken, undefined, 'storeToken should be removed');
    assert.strictEqual(mod.storeCredentials, undefined, 'storeCredentials should be removed');
    assert.strictEqual(mod.getCredentials, undefined, 'getCredentials should be removed');
    assert.strictEqual(mod.clearAll, undefined, 'clearAll should be removed');
    assert.strictEqual(mod.isTokenExpired, undefined, 'isTokenExpired should be removed');
  });
});
