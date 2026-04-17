import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { createAuthManager } from '../../src/auth/manager.js';

function mockKeychain(
  initial: { token: string; expiresAt: number; email: string; refreshToken: string } | null
) {
  let state = initial;
  return {
    getToken: mock.fn(async () => state),
    setToken: mock.fn(async (v: typeof state) => {
      state = v;
    }),
    clearCredentials: mock.fn(async () => {
      state = null;
    }),
  };
}

describe('AuthManager', () => {
  test('getToken returns valid JWT when not expired', async () => {
    const keychain = mockKeychain({
      token: 'jwt',
      expiresAt: Date.now() + 10 * 60 * 1000,
      email: 'a@b.com',
      refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    assert.strictEqual(await auth.getToken(), 'jwt');
  });

  test('getToken throws TOKEN_EXPIRED when expired', async () => {
    const keychain = mockKeychain({
      token: 'jwt',
      expiresAt: Date.now() - 1000,
      email: 'a@b.com',
      refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    await assert.rejects(
      () => auth.getToken(),
      (err: Error) => (err as unknown as { code: string }).code === 'TOKEN_EXPIRED'
    );
  });

  test('getToken throws TOKEN_EXPIRED when within 60s buffer', async () => {
    const keychain = mockKeychain({
      token: 'jwt',
      expiresAt: Date.now() + 30 * 1000,
      email: 'a@b.com',
      refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    await assert.rejects(
      () => auth.getToken(),
      (err: Error) => (err as unknown as { code: string }).code === 'TOKEN_EXPIRED'
    );
  });

  test('getToken throws NOT_AUTHENTICATED when keychain empty', async () => {
    const keychain = mockKeychain(null);
    const auth = createAuthManager({ keychain });
    await assert.rejects(
      () => auth.getToken(),
      (err: Error) => (err as unknown as { code: string }).code === 'NOT_AUTHENTICATED'
    );
  });

  test('setToken persists to keychain', async () => {
    const keychain = mockKeychain(null);
    const auth = createAuthManager({ keychain });
    await auth.setToken({ token: 't', expiresAt: 1, email: 'e', refreshToken: 'r' });
    assert.strictEqual(keychain.setToken.mock.calls.length, 1);
  });

  test('logout clears keychain', async () => {
    const keychain = mockKeychain({
      token: 'jwt',
      expiresAt: Date.now() + 10000,
      email: 'a@b.com',
      refreshToken: 'r',
    });
    const auth = createAuthManager({ keychain });
    await auth.logout();
    assert.strictEqual(keychain.clearCredentials.mock.calls.length, 1);
  });
});
