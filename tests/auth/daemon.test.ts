import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { createDaemon } from '../../src/auth/daemon.js';
import type { StoredToken, StoredCredentials } from '../../src/auth/keychain.js';
import type { SocketRequest } from '../../src/auth/socket.js';

describe('AuthDaemon', () => {

  test('refreshIfNeeded does nothing when token is fresh', async () => {
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes from now
    const mockKeychain = {
      getToken: mock.fn(async () => ({
        token: 'valid-token',
        expiresAt,
      } as StoredToken)),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => ({
        email: 'test@test.com',
        password: 'pass',
      } as StoredCredentials)),
      isTokenExpired: mock.fn(() => false),
    };

    const mockPlaywright = {
      automatedLogin: mock.fn(async () => ({
        token: 'new-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
      })),
    };

    const daemon = createDaemon({
      keychain: mockKeychain,
      playwright: mockPlaywright,
    });

    await daemon.refreshIfNeeded();

    // Should not have called automatedLogin since token is fresh
    assert.strictEqual(mockPlaywright.automatedLogin.mock.calls.length, 0);
  });

  test('refreshIfNeeded refreshes when token is expiring soon', async () => {
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now
    const mockKeychain = {
      getToken: mock.fn(async () => ({
        token: 'expiring-token',
        expiresAt,
      } as StoredToken)),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => ({
        email: 'test@test.com',
        password: 'pass',
      } as StoredCredentials)),
      isTokenExpired: mock.fn(() => true),
    };

    const newExpiresAt = Date.now() + 60 * 60 * 1000;
    const mockPlaywright = {
      automatedLogin: mock.fn(async () => ({
        token: 'new-token',
        expiresAt: newExpiresAt,
      })),
    };

    const daemon = createDaemon({
      keychain: mockKeychain,
      playwright: mockPlaywright,
    });

    await daemon.refreshIfNeeded();

    // Should have refreshed
    assert.strictEqual(mockPlaywright.automatedLogin.mock.calls.length, 1);
    assert.strictEqual(mockKeychain.storeToken.mock.calls.length, 1);

    // Verify correct credentials were passed
    const callArgs = mockPlaywright.automatedLogin.mock.calls[0].arguments;
    assert.deepStrictEqual(callArgs, ['test@test.com', 'pass']);
  });

  test('refreshIfNeeded handles missing credentials', async () => {
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now
    const mockKeychain = {
      getToken: mock.fn(async () => ({
        token: 'expiring-token',
        expiresAt,
      } as StoredToken)),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => null),
      isTokenExpired: mock.fn(() => true),
    };

    const mockPlaywright = {
      automatedLogin: mock.fn(async () => ({
        token: 'new-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
      })),
    };

    const daemon = createDaemon({
      keychain: mockKeychain,
      playwright: mockPlaywright,
    });

    await daemon.refreshIfNeeded();

    // Should not have attempted refresh without credentials
    assert.strictEqual(mockPlaywright.automatedLogin.mock.calls.length, 0);
  });

  test('handleRequest returns token for GET /token', async () => {
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const mockKeychain = {
      getToken: mock.fn(async () => ({
        token: 'test-token',
        expiresAt,
      } as StoredToken)),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => ({
        email: 'test@test.com',
        password: 'pass',
      } as StoredCredentials)),
    };

    const daemon = createDaemon({ keychain: mockKeychain });
    const response = (await daemon.handleRequest({
      method: 'GET',
      path: '/token',
    })) as Record<string, unknown>;

    assert.strictEqual(response.token, 'test-token');
    assert.ok(response.expiresAt);
    assert.match(response.expiresAt as string, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('handleRequest returns error when no token', async () => {
    const mockKeychain = {
      getToken: mock.fn(async () => null),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => null),
    };

    const daemon = createDaemon({ keychain: mockKeychain });
    const response = (await daemon.handleRequest({
      method: 'GET',
      path: '/token',
    })) as Record<string, unknown>;

    assert.ok(response.error);
    assert.match(response.error as string, /not authenticated/i);
  });

  test('handleRequest returns status with authenticated token', async () => {
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const mockKeychain = {
      getToken: mock.fn(async () => ({
        token: 'test-token',
        expiresAt,
      } as StoredToken)),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => ({
        email: 'test@test.com',
        password: 'pass',
      } as StoredCredentials)),
    };

    const daemon = createDaemon({ keychain: mockKeychain });
    const response = (await daemon.handleRequest({
      method: 'GET',
      path: '/status',
    })) as Record<string, unknown>;

    assert.strictEqual(response.authenticated, true);
    assert.strictEqual(response.email, 'test@test.com');
    assert.ok(response.expiresAt);
  });

  test('handleRequest returns status without authentication', async () => {
    const mockKeychain = {
      getToken: mock.fn(async () => null),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => null),
    };

    const daemon = createDaemon({ keychain: mockKeychain });
    const response = (await daemon.handleRequest({
      method: 'GET',
      path: '/status',
    })) as Record<string, unknown>;

    assert.strictEqual(response.authenticated, false);
    assert.strictEqual(response.email, null);
    assert.strictEqual(response.expiresAt, null);
  });

  test('handleRequest processes refresh request', async () => {
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const mockKeychain = {
      getToken: mock.fn(async () => ({
        token: 'test-token',
        expiresAt,
      } as StoredToken)),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => ({
        email: 'test@test.com',
        password: 'pass',
      } as StoredCredentials)),
      isTokenExpired: mock.fn(() => false),
    };

    const mockPlaywright = {
      automatedLogin: mock.fn(async () => ({
        token: 'new-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
      })),
    };

    const daemon = createDaemon({
      keychain: mockKeychain,
      playwright: mockPlaywright,
    });

    const response = (await daemon.handleRequest({
      method: 'POST',
      path: '/refresh',
    })) as Record<string, unknown>;

    assert.strictEqual(response.success, true);
    assert.ok(response.expiresAt);
    assert.strictEqual(response.error, null);
  });

  test('handleRequest returns error for unknown request', async () => {
    const mockKeychain = {
      getToken: mock.fn(async () => null),
      storeToken: mock.fn(async () => {}),
      getCredentials: mock.fn(async () => null),
    };

    const daemon = createDaemon({ keychain: mockKeychain });
    const response = (await daemon.handleRequest({
      method: 'POST',
      path: '/token',
    } as SocketRequest)) as Record<string, unknown>;

    // POST to /token should return an error since it's not a supported method
    assert.ok(response.error);
  });
});
