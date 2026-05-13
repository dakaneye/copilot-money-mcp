import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getBudgets } from '../../src/tools/budgets.js';
import type { LocalStore } from '../../src/localstore/index.js';
import type { Budget } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(budgets: Budget[]): LocalStore {
  return {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => []),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async () => []),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => budgets),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: 0, lastUpdatedAt: null },
        tags: { count: 0, lastUpdatedAt: null },
        transactions: { count: 0, lastUpdatedAt: null },
        recurring: { count: 0, lastUpdatedAt: null },
        budgets: { count: budgets.length, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
    })),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
}

function budget(partial: Partial<Budget> = {}): Budget {
  return {
    id: 'bud_001',
    userId: 'user_1',
    categoryId: 'cat_groceries',
    defaultAmount: 500,
    monthlyOverrides: null,
    ...partial,
  };
}

describe('getBudgets tool', () => {
  it('returns budgets from LocalStore', async () => {
    const store = mockLocalStore([
      budget({ id: 'bud_001', categoryId: 'cat_groceries', defaultAmount: 500 }),
      budget({ id: 'bud_002', categoryId: 'cat_dining', defaultAmount: 300 }),
      budget({
        id: 'bud_003',
        categoryId: 'cat_travel',
        defaultAmount: 0,
        monthlyOverrides: { '2026-04': 1200 },
      }),
    ]);

    const result = await getBudgets(store);

    assert.strictEqual(result.length, 3);
    const ids = result.map((b) => b.id);
    assert.ok(ids.includes('bud_001'));
    assert.ok(ids.includes('bud_002'));
    assert.ok(ids.includes('bud_003'));

    const withOverride = result.find((b) => b.id === 'bud_003');
    assert.deepStrictEqual(withOverride?.monthlyOverrides, { '2026-04': 1200 });
  });

  it('returns an empty array when LocalStore has no budgets', async () => {
    const store = mockLocalStore([]);

    const result = await getBudgets(store);

    assert.strictEqual(result.length, 0);
    assert.deepStrictEqual(result, []);
  });

  it('propagates LocalStore errors (LOCAL_CACHE_MISSING)', async () => {
    const store = mockLocalStore([]);
    (
      store.getBudgets as unknown as {
        mock: { mockImplementation: (fn: () => Promise<Budget[]>) => void };
      }
    ).mock.mockImplementation(async () => {
      throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'cache missing');
    });

    await assert.rejects(
      () => getBudgets(store),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });
});
