import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isTokenExpired } from '../../dist/auth/keychain.js';

describe('Keychain', () => {
  it('should detect expired tokens', () => {
    const expiredTime = Date.now() - 1000; // 1 second in past
    const isExpired = isTokenExpired(expiredTime);
    assert.strictEqual(isExpired, true, 'Should detect expired token');
  });

  it('should detect valid tokens', () => {
    const validTime = Date.now() + 3600000; // 1 hour in future
    const isExpired = isTokenExpired(validTime);
    assert.strictEqual(isExpired, false, 'Should recognize valid token');
  });

  it('should handle null expiration time', () => {
    const isExpired = isTokenExpired(null);
    assert.strictEqual(isExpired, false, 'Should handle null expiration');
  });

  it('should consider tokens expired within 5-minute buffer', () => {
    // Token expiring in 3 minutes (within 5-minute buffer)
    const soonToExpire = Date.now() + 3 * 60 * 1000;
    assert.strictEqual(isTokenExpired(soonToExpire), true, 'Should mark as expired when within 5-minute buffer');
  });

  it('should consider tokens valid after 5-minute buffer', () => {
    // Token expiring in 10 minutes (beyond 5-minute buffer)
    const stillValid = Date.now() + 10 * 60 * 1000;
    assert.strictEqual(isTokenExpired(stillValid), false, 'Should mark as valid when beyond 5-minute buffer');
  });
});
