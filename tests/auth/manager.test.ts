import { describe, it, beforeEach, mock, type Mock } from 'node:test';
import assert from 'node:assert';
import { AuthManager, type KeychainDeps } from '../../src/auth/manager.js';
import { CopilotMoneyError } from '../../src/types/error.js';
import type { StoredTokens } from '../../src/auth/keychain.js';

type MockFn<T extends (...args: never[]) => unknown> = Mock<T>;

describe('AuthManager', () => {
  let authManager: AuthManager;
  let getStoredTokensMock: MockFn<() => Promise<StoredTokens | null>>;
  let clearTokensMock: MockFn<() => Promise<void>>;
  let isTokenExpiredMock: MockFn<(expiresAt: number | null) => boolean>;

  beforeEach(() => {
    getStoredTokensMock = mock.fn<() => Promise<StoredTokens | null>>(() => Promise.resolve(null));
    clearTokensMock = mock.fn<() => Promise<void>>(() => Promise.resolve());
    isTokenExpiredMock = mock.fn<(expiresAt: number | null) => boolean>(() => false);

    const mockDeps: KeychainDeps = {
      getStoredTokens: getStoredTokensMock,
      clearTokens: clearTokensMock,
      isTokenExpired: isTokenExpiredMock,
    };
    authManager = new AuthManager(mockDeps);
  });

  describe('getAccessToken', () => {
    it('should return cached token if available', async () => {
      const token = 'cached-token';
      (authManager as unknown as { cachedToken: string })['cachedToken'] = token;

      const result = await authManager.getAccessToken();
      assert.strictEqual(result, token);
      assert.strictEqual(getStoredTokensMock.mock.callCount(), 0);
    });

    it('should throw NOT_AUTHENTICATED when no stored tokens', async () => {
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

    it('should return stored token when not expired', async () => {
      const storedToken: StoredTokens = {
        accessToken: 'stored-token',
        refreshToken: null,
        expiresAt: Date.now() + 60000,
      };

      getStoredTokensMock.mock.mockImplementation(() => Promise.resolve(storedToken));

      const result = await authManager.getAccessToken();
      assert.strictEqual(result, 'stored-token');
    });

    it('should throw NOT_AUTHENTICATED when stored token is expired', async () => {
      const storedToken: StoredTokens = {
        accessToken: 'expired-token',
        refreshToken: null,
        expiresAt: Date.now() - 60000,
      };

      getStoredTokensMock.mock.mockImplementation(() => Promise.resolve(storedToken));
      isTokenExpiredMock.mock.mockImplementation(() => true);

      await assert.rejects(
        () => authManager.getAccessToken(),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'NOT_AUTHENTICATED'
          );
        }
      );
    });
  });

  describe('handleAuthError', () => {
    it('should clear cache and tokens then throw', async () => {
      (authManager as unknown as { cachedToken: string })['cachedToken'] = 'some-token';

      await assert.rejects(
        () => authManager.handleAuthError(),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'NOT_AUTHENTICATED'
          );
        }
      );

      assert.strictEqual(clearTokensMock.mock.callCount(), 1);
      assert.strictEqual((authManager as unknown as { cachedToken: string | null })['cachedToken'], null);
    });
  });

  describe('logout', () => {
    it('should clear cached token and call clearTokens', async () => {
      (authManager as unknown as { cachedToken: string })['cachedToken'] = 'some-token';

      await authManager.logout();

      assert.strictEqual((authManager as unknown as { cachedToken: string | null })['cachedToken'], null);
      assert.strictEqual(clearTokensMock.mock.callCount(), 1);
    });
  });

  describe('ensureAuthenticated', () => {
    it('should delegate to getAccessToken', async () => {
      const token = 'test-token';
      (authManager as unknown as { cachedToken: string })['cachedToken'] = token;

      const result = await authManager.ensureAuthenticated();
      assert.strictEqual(result, token);
    });
  });
});
