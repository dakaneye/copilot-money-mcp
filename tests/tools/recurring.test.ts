import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getRecurring } from '../../src/tools/recurring.js';
import type { LocalStore } from '../../src/localstore/index.js';
import type { Recurring } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(recurring: Recurring[]): LocalStore {
  return {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => []),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async () => []),
    getRecurring: mock.fn(async () => recurring),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: 0, lastUpdatedAt: null },
        tags: { count: 0, lastUpdatedAt: null },
        transactions: { count: 0, lastUpdatedAt: null },
        recurring: { count: recurring.length, lastUpdatedAt: null },
        budgets: { count: 0, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
    })),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
}

function recurring(partial: Partial<Recurring> = {}): Recurring {
  return {
    id: 'rec_001',
    userId: 'user_1',
    name: 'Netflix',
    amount: 15.99,
    emoji: null,
    frequency: 'monthly',
    latestDate: '2026-04-01',
    categoryId: 'cat_entertainment',
    state: 'active',
    isActive: true,
    matchString: null,
    ...partial,
  };
}

describe('getRecurring tool', () => {
  it('returns recurring items from LocalStore', async () => {
    const store = mockLocalStore([
      recurring({ id: 'rec_001', name: 'Netflix' }),
      recurring({ id: 'rec_002', name: 'Spotify' }),
      recurring({ id: 'rec_003', name: 'Gym' }),
    ]);

    const result = await getRecurring(store);

    assert.strictEqual(result.length, 3);
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes('rec_001'));
    assert.ok(ids.includes('rec_002'));
    assert.ok(ids.includes('rec_003'));
  });

  it('returns an empty array when LocalStore has no recurring items', async () => {
    const store = mockLocalStore([]);

    const result = await getRecurring(store);

    assert.strictEqual(result.length, 0);
    assert.deepStrictEqual(result, []);
  });

  it('propagates LocalStore errors (LOCAL_CACHE_MISSING)', async () => {
    const store = mockLocalStore([]);
    (
      store.getRecurring as unknown as {
        mock: { mockImplementation: (fn: () => Promise<Recurring[]>) => void };
      }
    ).mock.mockImplementation(async () => {
      throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'cache missing');
    });

    await assert.rejects(
      () => getRecurring(store),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });
});
