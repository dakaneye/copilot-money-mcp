import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  getCategories,
  buildCategoryMap,
  type GetCategoriesInput,
} from '../../src/tools/categories.js';
import type { LocalStore } from '../../src/localstore/index.js';
import type { Category } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(categories: Category[]): LocalStore {
  return {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => categories),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async () => []),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: categories.length, lastUpdatedAt: null },
        tags: { count: 0, lastUpdatedAt: null },
        transactions: { count: 0, lastUpdatedAt: null },
        recurring: { count: 0, lastUpdatedAt: null },
        budgets: { count: 0, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
    })),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
}

function category(partial: Partial<Category> = {}): Category {
  return {
    id: 'cat_001',
    name: 'Food & Drink',
    icon: { unicode: '🍔' },
    colorName: 'orange',
    templateId: null,
    isExcluded: false,
    isRolloverDisabled: false,
    canBeDeleted: true,
    childCategories: [],
    ...partial,
  };
}

describe('getCategories tool', () => {
  it('returns categories from LocalStore', async () => {
    const store = mockLocalStore([
      category({ id: 'cat_001', name: 'Food & Drink' }),
      category({ id: 'cat_002', name: 'Transportation' }),
      category({ id: 'cat_003', name: 'Shopping' }),
    ]);

    const input: GetCategoriesInput = {};
    const result = await getCategories(store, input);

    assert.strictEqual(result.length, 3);
    const ids = result.map((c) => c.id);
    assert.ok(ids.includes('cat_001'));
    assert.ok(ids.includes('cat_002'));
    assert.ok(ids.includes('cat_003'));
  });

  it('returns an empty array when LocalStore has no categories', async () => {
    const store = mockLocalStore([]);

    const result = await getCategories(store, {});

    assert.strictEqual(result.length, 0);
  });

  it('ignores include_spending flag (no-op under local cache)', async () => {
    const store = mockLocalStore([
      category({ id: 'cat_001', name: 'Food & Drink' }),
      category({ id: 'cat_002', name: 'Transportation' }),
    ]);

    // include_spending is a no-op under the local-cache backend — the flag
    // must not throw or alter the shape of the returned categories.
    const withFlag = await getCategories(store, { include_spending: true });
    const withoutFlag = await getCategories(store, {});

    assert.strictEqual(withFlag.length, 2);
    assert.strictEqual(withoutFlag.length, 2);
    assert.deepStrictEqual(
      withFlag.map((c) => c.id),
      withoutFlag.map((c) => c.id)
    );
  });

  it('propagates LocalStore errors (LOCAL_CACHE_MISSING)', async () => {
    const store = mockLocalStore([]);
    (
      store.getCategories as unknown as {
        mock: { mockImplementation: (fn: () => Promise<Category[]>) => void };
      }
    ).mock.mockImplementation(async () => {
      throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'cache missing');
    });

    await assert.rejects(
      () => getCategories(store, {}),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });
});

describe('buildCategoryMap', () => {
  it('should create lowercase name to id map', () => {
    const categories: Category[] = [
      category({ id: 'cat_001', name: 'Food & Drink' }),
      category({ id: 'cat_002', name: 'Transportation' }),
    ];

    const map = buildCategoryMap(categories);

    assert.strictEqual(map.get('food & drink'), 'cat_001');
    assert.strictEqual(map.get('transportation'), 'cat_002');
  });

  it('should handle case-insensitive lookups', () => {
    const categories: Category[] = [category({ id: 'cat_001', name: 'GROCERIES' })];

    const map = buildCategoryMap(categories);

    assert.strictEqual(map.get('groceries'), 'cat_001');
  });

  it('should return empty map for empty input', () => {
    const map = buildCategoryMap([]);

    assert.strictEqual(map.size, 0);
  });
});
