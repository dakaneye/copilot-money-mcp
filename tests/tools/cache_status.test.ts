import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getCacheStatus } from '../../src/tools/cache_status.js';
import type { CacheStatus, LocalStore } from '../../src/localstore/index.js';

function mockLocalStore(status: CacheStatus): LocalStore {
  return {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => []),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async () => []),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => status),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
}

function realStatus(): CacheStatus {
  return {
    cacheLocation: '/Users/test/Library/Application Support/Copilot/firestore',
    entities: {
      accounts: { count: 4, lastUpdatedAt: '2026-04-17T12:00:00Z' },
      categories: { count: 42, lastUpdatedAt: '2026-04-16T08:00:00Z' },
      tags: { count: 7, lastUpdatedAt: null },
      transactions: {
        count: 1500,
        lastUpdatedAt: '2026-04-17T14:30:00Z',
      },
      recurring: { count: 12, lastUpdatedAt: '2026-04-15T00:00:00Z' },
      budgets: { count: 3, lastUpdatedAt: '2026-04-01T00:00:00Z' },
    },
    totalSizeBytes: 1_234_567,
  };
}

describe('getCacheStatus tool', () => {
  it('returns the LocalStore status object on the happy path', async () => {
    const status = realStatus();
    const store = mockLocalStore(status);

    const result = await getCacheStatus(store);

    assert.deepStrictEqual(result, status);
    assert.strictEqual(result.cacheLocation, status.cacheLocation);
    assert.strictEqual(result.entities.transactions.count, 1500);
    assert.strictEqual(result.totalSizeBytes, 1_234_567);
  });

  it('omits the error field for a real (non-stub) LocalStore', async () => {
    const store = mockLocalStore(realStatus());

    const result = await getCacheStatus(store);

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(result, 'error'),
      false,
      'real status must not carry an error field'
    );
  });

  it('surfaces a diagnostic status from the cacheMissingStub shape', async () => {
    // Simulate the cacheMissingStub's output shape — zeroed counts plus a
    // populated `error` field that explains why the cache is unavailable.
    const stubStatus: CacheStatus = {
      cacheLocation: '<unavailable>',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: 0, lastUpdatedAt: null },
        tags: { count: 0, lastUpdatedAt: null },
        transactions: { count: 0, lastUpdatedAt: null },
        recurring: { count: 0, lastUpdatedAt: null },
        budgets: { count: 0, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
      error:
        'Cache path does not exist: /Users/test/Library/Application Support/Copilot/firestore',
    };
    const store = mockLocalStore(stubStatus);

    const result = await getCacheStatus(store);

    assert.strictEqual(result.cacheLocation, '<unavailable>');
    assert.strictEqual(result.totalSizeBytes, 0);
    assert.strictEqual(result.entities.transactions.count, 0);
    assert.strictEqual(result.entities.transactions.lastUpdatedAt, null);
    assert.ok(
      result.error && result.error.includes('Cache path does not exist'),
      'diagnostic status must populate `error` with the underlying reason'
    );
  });
});
