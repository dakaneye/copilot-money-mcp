import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { AuthManager } from '../../src/auth/manager.js';

describe('AuthManager', () => {
  test('getAccessToken returns token from socket client', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'test-token-123',
        expiresAt: '2026-03-27T18:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
      isRunning: mock.fn(() => Promise.resolve(true)),
      getStatus: mock.fn(() => Promise.resolve({ authenticated: true, email: null, expiresAt: null })),
    };

    const manager = new AuthManager(mockClient as never);

    const token = await manager.getAccessToken();

    assert.strictEqual(token, 'test-token-123');
    assert.strictEqual(mockClient.getToken.mock.calls.length, 1);
  });

  test('getAccessToken caches token for 30 seconds', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'test-token-123',
        expiresAt: '2026-03-27T18:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
    };

    const manager = new AuthManager(mockClient as never);

    // First call
    await manager.getAccessToken();
    // Second call should use cache
    await manager.getAccessToken();

    assert.strictEqual(mockClient.getToken.mock.calls.length, 1);
  });

  test('getAccessToken throws when daemon not running', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.reject(new Error('Auth daemon not running. Run `copilot-auth login` first.'))),
      refresh: mock.fn(() => Promise.resolve({ success: false, expiresAt: null })),
    };

    const manager = new AuthManager(mockClient as never);

    await assert.rejects(
      () => manager.getAccessToken(),
      /daemon not running/i
    );
  });

  test('handleAuthError attempts refresh', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'refreshed-token',
        expiresAt: '2026-03-27T19:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
    };

    const manager = new AuthManager(mockClient as never);

    const token = await manager.handleAuthError();

    assert.strictEqual(mockClient.refresh.mock.calls.length, 1);
    assert.strictEqual(token, 'refreshed-token');
  });

  test('ensureAuthenticated delegates to getAccessToken', async () => {
    const mockClient = {
      getToken: mock.fn(() => Promise.resolve({
        token: 'test-token',
        expiresAt: '2026-03-27T18:00:00.000Z',
      })),
      refresh: mock.fn(() => Promise.resolve({ success: true, expiresAt: null })),
    };

    const manager = new AuthManager(mockClient as never);

    const token = await manager.ensureAuthenticated();

    assert.strictEqual(token, 'test-token');
  });
});
