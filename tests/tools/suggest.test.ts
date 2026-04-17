import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  suggestCategories,
  type SuggestCategoriesInput,
} from '../../src/tools/suggest.js';
import type { LocalStore, TransactionFilter } from '../../src/localstore/index.js';
import type { Category, Transaction } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(
  transactions: Transaction[],
  categories: Category[]
): LocalStore {
  return {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => categories),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async (filter?: TransactionFilter) => {
      const limit = filter?.limit ?? 200;
      const sorted = [...transactions].sort((a, b) => {
        if (a.date === b.date) return a.id.localeCompare(b.id);
        return a.date < b.date ? 1 : -1;
      });
      return sorted.slice(0, limit);
    }),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: categories.length, lastUpdatedAt: null },
        tags: { count: 0, lastUpdatedAt: null },
        transactions: { count: transactions.length, lastUpdatedAt: null },
        recurring: { count: 0, lastUpdatedAt: null },
        budgets: { count: 0, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
    })),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
}

function failingLocalStore(reason: string): LocalStore {
  const fail = async (): Promise<never> => {
    throw new CopilotMoneyError('LOCAL_CACHE_MISSING', reason);
  };
  return {
    getAccounts: fail,
    getCategories: fail,
    getTags: fail,
    getTransactions: fail,
    getRecurring: fail,
    getBudgets: fail,
    getCacheStatus: fail,
    close: async () => {},
  } as unknown as LocalStore;
}

function category(partial: Partial<Category> = {}): Category {
  return {
    id: 'cat_default',
    name: 'Default',
    colorName: 'gray',
    icon: null,
    templateId: null,
    isExcluded: false,
    isRolloverDisabled: false,
    canBeDeleted: true,
    childCategories: [],
    ...partial,
  };
}

function txn(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_001',
    itemId: 'item_001',
    accountId: 'acc_001',
    name: 'UNKNOWN MERCHANT',
    amount: -25.5,
    date: '2026-03-20',
    type: 'debit',
    categoryId: null,
    isReviewed: false,
    isPending: false,
    recurringId: null,
    suggestedCategoryIds: [],
    userNotes: null,
    tipAmount: null,
    createdAt: '2026-03-20T10:00:00Z',
    tags: [],
    goal: null,
    ...partial,
  };
}

describe('suggestCategories', () => {
  const input: SuggestCategoriesInput = { limit: 10 };

  it('uses Copilot suggestedCategoryIds with high confidence when available', async () => {
    const categories = [
      category({ id: 'cat_coffee', name: 'Coffee Shops' }),
      category({ id: 'cat_transport', name: 'Transportation' }),
    ];
    const store = mockLocalStore(
      [
        txn({
          id: 'txn_1',
          name: 'Some Random Place',
          suggestedCategoryIds: ['cat_coffee'],
        }),
      ],
      categories
    );

    const result = await suggestCategories(store, input);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].suggestedCategory, 'Coffee Shops');
    assert.strictEqual(result[0].confidence, 'high');
    assert.match(result[0].reason, /Suggested by Copilot Money/);
  });

  it('falls back to merchant-name pattern matching with medium confidence', async () => {
    const categories = [category({ id: 'cat_transport', name: 'Transportation' })];
    const store = mockLocalStore(
      [txn({ id: 'txn_1', name: 'UBER TRIP 1234' })],
      categories
    );

    const result = await suggestCategories(store, input);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].suggestedCategory, 'Transportation');
    assert.strictEqual(result[0].confidence, 'medium');
    assert.match(result[0].reason, /UBER TRIP 1234/);
  });

  it('skips transactions that neither match a pattern nor have Copilot suggestions', async () => {
    const categories = [category({ id: 'cat_transport', name: 'Transportation' })];
    const store = mockLocalStore(
      [txn({ id: 'txn_1', name: 'COMPLETELY RANDOM VENDOR' })],
      categories
    );

    const result = await suggestCategories(store, input);
    assert.strictEqual(result.length, 0);
  });

  it('skips reviewed and already-categorized transactions', async () => {
    const categories = [category({ id: 'cat_transport', name: 'Transportation' })];
    const store = mockLocalStore(
      [
        txn({ id: 'txn_reviewed', name: 'UBER TRIP', isReviewed: true }),
        txn({ id: 'txn_categorized', name: 'UBER TRIP', categoryId: 'cat_transport' }),
      ],
      categories
    );

    const result = await suggestCategories(store, input);
    assert.strictEqual(result.length, 0);
  });

  it('respects the limit input', async () => {
    const categories = [category({ id: 'cat_transport', name: 'Transportation' })];
    const store = mockLocalStore(
      [
        txn({ id: 'txn_1', name: 'UBER 1', date: '2026-03-20' }),
        txn({ id: 'txn_2', name: 'UBER 2', date: '2026-03-19' }),
        txn({ id: 'txn_3', name: 'UBER 3', date: '2026-03-18' }),
      ],
      categories
    );

    const result = await suggestCategories(store, { limit: 2 });
    assert.strictEqual(result.length, 2);
  });

  it('propagates LOCAL_CACHE_MISSING from the store', async () => {
    const store = failingLocalStore('Cache path does not exist');

    await assert.rejects(
      () => suggestCategories(store, input),
      (err: unknown) =>
        err instanceof CopilotMoneyError && err.code === 'LOCAL_CACHE_MISSING'
    );
  });
});
