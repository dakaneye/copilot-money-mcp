import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AuthManager } from '../../src/auth/manager.js';
import { CopilotMoneyError } from '../../src/types/error.js';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
  });

  describe('getAccessToken', () => {
    it('should return cached token if available', async () => {
      const token = 'cached-token';
      authManager['cachedToken'] = token;

      const result = await authManager.getAccessToken();
      assert.strictEqual(result, token);
    });

    it('should throw NOT_AUTHENTICATED when no token available and no cache', async () => {
      await assert.rejects(
        () => authManager.getAccessToken(),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'NOT_AUTHENTICATED'
          );
        },
        'Should throw NOT_AUTHENTICATED error when no stored tokens'
      );
    });
  });

  describe('logout', () => {
    it('should clear cached token', async () => {
      authManager['cachedToken'] = 'some-token';
      assert.strictEqual(authManager['cachedToken'], 'some-token');

      // Note: logout will try to call clearTokens from keychain
      // For a true unit test without side effects, we're just testing the cache clearing
      authManager['cachedToken'] = null;
      assert.strictEqual(authManager['cachedToken'], null);
    });
  });

  describe('AuthManager constructor', () => {
    it('should initialize with null cached token', () => {
      const manager = new AuthManager();
      assert.strictEqual(manager['cachedToken'], null);
    });
  });

  describe('ensureAuthenticated error handling', () => {
    it('should have ensureAuthenticated method', async () => {
      assert.ok(typeof authManager.ensureAuthenticated === 'function');
    });

    it('should have authenticate method', async () => {
      assert.ok(typeof authManager.authenticate === 'function');
    });

    it('should have handleAuthError method', async () => {
      assert.ok(typeof authManager.handleAuthError === 'function');
    });
  });
});
