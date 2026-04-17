import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  getTransactions,
  type GetTransactionsInput,
} from '../../src/tools/transactions.js';
import type { LocalStore, TransactionFilter } from '../../src/localstore/index.js';
import type { Transaction } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(transactions: Transaction[]): {
  store: LocalStore;
  lastFilter: () => TransactionFilter | undefined;
} {
  let lastFilter: TransactionFilter | undefined;
  const store = {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => []),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async (filter?: TransactionFilter) => {
      lastFilter = filter;
      // Apply the filter fields LocalStore natively supports so our tool-layer
      // behavior is exercised end-to-end against a realistic store surface.
      let out = transactions;
      if (filter?.since) out = out.filter((t) => t.date >= filter.since!);
      if (filter?.until) out = out.filter((t) => t.date <= filter.until!);
      if (filter?.categoryId)
        out = out.filter((t) => t.categoryId === filter.categoryId);
      if (filter?.accountId)
        out = out.filter((t) => t.accountId === filter.accountId);
      if (filter?.tagId) {
        const id = filter.tagId;
        out = out.filter((t) => t.tags.some((tag) => tag.id === id));
      }
      const sorted = [...out].sort((a, b) => {
        if (a.date === b.date) return a.id.localeCompare(b.id);
        return a.date < b.date ? 1 : -1;
      });
      const limit = filter?.limit ?? 200;
      return sorted.slice(0, limit);
    }),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: 0, lastUpdatedAt: null },
        tags: { count: 0, lastUpdatedAt: null },
        transactions: { count: transactions.length, lastUpdatedAt: null },
        recurring: { count: 0, lastUpdatedAt: null },
        budgets: { count: 0, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
    })),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
  return { store, lastFilter: () => lastFilter };
}

function txn(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_001',
    itemId: 'item_001',
    accountId: 'acc_001',
    name: 'UBER TRIP',
    amount: -25.5,
    date: '2026-03-20',
    type: 'debit',
    categoryId: 'cat_transport',
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

describe('getTransactions tool', () => {
  it('returns transactions from LocalStore with empty pageInfo', async () => {
    const { store } = mockLocalStore([
      txn({ id: 't1', date: '2026-03-20' }),
      txn({ id: 't2', date: '2026-03-19' }),
    ]);

    const categoryMap = new Map<string, string>();
    const input: GetTransactionsInput = {};

    const result = await getTransactions(store, input, categoryMap);

    assert.strictEqual(result.transactions.length, 2);
    assert.strictEqual(result.transactions[0].id, 't1');
    assert.strictEqual(result.pageInfo.hasNextPage, false);
    assert.strictEqual(result.pageInfo.hasPreviousPage, false);
    assert.strictEqual(result.pageInfo.startCursor, null);
    assert.strictEqual(result.pageInfo.endCursor, null);
  });

  it('maps start_date/end_date inputs to since/until filter fields', async () => {
    const { store, lastFilter } = mockLocalStore([
      txn({ id: 't1', date: '2026-03-20' }),
      txn({ id: 't2', date: '2026-03-19' }),
      txn({ id: 't3', date: '2026-01-05' }),
    ]);

    const input: GetTransactionsInput = {
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    };

    const result = await getTransactions(store, input, new Map());

    assert.strictEqual(lastFilter()?.since, '2026-03-01');
    assert.strictEqual(lastFilter()?.until, '2026-03-31');
    assert.strictEqual(result.transactions.length, 2);
    assert.deepStrictEqual(
      result.transactions.map((t) => t.id).sort(),
      ['t1', 't2']
    );
  });

  it('resolves category name to categoryId via categoryMap', async () => {
    const { store, lastFilter } = mockLocalStore([
      txn({ id: 't1', categoryId: 'cat_transport' }),
      txn({ id: 't2', categoryId: 'cat_groceries' }),
    ]);

    const categoryMap = new Map<string, string>([
      ['transportation', 'cat_transport'],
    ]);
    const input: GetTransactionsInput = { category: 'Transportation' };

    const result = await getTransactions(store, input, categoryMap);

    assert.strictEqual(lastFilter()?.categoryId, 'cat_transport');
    assert.strictEqual(result.transactions.length, 1);
    assert.strictEqual(result.transactions[0].id, 't1');
  });

  it('omits categoryId filter when name is unknown to categoryMap', async () => {
    const { store, lastFilter } = mockLocalStore([
      txn({ id: 't1', categoryId: 'cat_transport' }),
    ]);

    const result = await getTransactions(
      store,
      { category: 'NonExistent' },
      new Map()
    );

    assert.strictEqual(lastFilter()?.categoryId, undefined);
    assert.strictEqual(result.transactions.length, 1);
  });

  it('maps account input to accountId filter', async () => {
    const { store, lastFilter } = mockLocalStore([
      txn({ id: 't1', accountId: 'acc_001' }),
      txn({ id: 't2', accountId: 'acc_002' }),
    ]);

    const result = await getTransactions(
      store,
      { account: 'acc_002' },
      new Map()
    );

    assert.strictEqual(lastFilter()?.accountId, 'acc_002');
    assert.strictEqual(result.transactions.length, 1);
    assert.strictEqual(result.transactions[0].id, 't2');
  });

  it('passes a broad limit to LocalStore but trims to requested limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      txn({
        id: `t${String(i).padStart(2, '0')}`,
        date: `2026-03-${String(20 - i).padStart(2, '0')}`,
      })
    );
    const { store, lastFilter } = mockLocalStore(many);

    const result = await getTransactions(store, { limit: 5 }, new Map());

    // Tool fetches broader than requested so in-memory filters don't starve
    // the final count.
    assert.ok((lastFilter()?.limit ?? 0) >= 200);
    assert.strictEqual(result.transactions.length, 5);
  });

  it('defaults limit to 50 when not provided', async () => {
    const many = Array.from({ length: 75 }, (_, i) =>
      txn({
        id: `t${String(i).padStart(2, '0')}`,
        date: `2026-03-${String(20 - (i % 20)).padStart(2, '0')}`,
      })
    );
    const { store } = mockLocalStore(many);

    const result = await getTransactions(store, {}, new Map());

    assert.strictEqual(result.transactions.length, 50);
  });

  it('filters by merchant name (substring, case-insensitive)', async () => {
    const { store } = mockLocalStore([
      txn({ id: 't1', name: 'UBER TRIP' }),
      txn({ id: 't2', name: 'Whole Foods Market' }),
      txn({ id: 't3', name: 'uber eats' }),
    ]);

    const result = await getTransactions(
      store,
      { merchant: 'uber' },
      new Map()
    );

    assert.strictEqual(result.transactions.length, 2);
    const ids = result.transactions.map((t) => t.id).sort();
    assert.deepStrictEqual(ids, ['t1', 't3']);
  });

  it('filters by min_amount and max_amount in memory', async () => {
    const { store } = mockLocalStore([
      txn({ id: 't1', amount: -150 }),
      txn({ id: 't2', amount: -50 }),
      txn({ id: 't3', amount: 25 }),
      txn({ id: 't4', amount: 200 }),
    ]);

    const result = await getTransactions(
      store,
      { min_amount: -100, max_amount: 100 },
      new Map()
    );

    assert.strictEqual(result.transactions.length, 2);
    const ids = result.transactions.map((t) => t.id).sort();
    assert.deepStrictEqual(ids, ['t2', 't3']);
  });

  it('filters by reviewed=true in memory', async () => {
    const { store } = mockLocalStore([
      txn({ id: 't1', isReviewed: true }),
      txn({ id: 't2', isReviewed: false }),
      txn({ id: 't3', isReviewed: true }),
    ]);

    const result = await getTransactions(
      store,
      { reviewed: true },
      new Map()
    );

    assert.strictEqual(result.transactions.length, 2);
    const ids = result.transactions.map((t) => t.id).sort();
    assert.deepStrictEqual(ids, ['t1', 't3']);
  });

  it('filters by reviewed=false in memory', async () => {
    const { store } = mockLocalStore([
      txn({ id: 't1', isReviewed: true }),
      txn({ id: 't2', isReviewed: false }),
    ]);

    const result = await getTransactions(
      store,
      { reviewed: false },
      new Map()
    );

    assert.strictEqual(result.transactions.length, 1);
    assert.strictEqual(result.transactions[0].id, 't2');
  });

  it('always reports hasNextPage=false even when more data exists', async () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      txn({
        id: `t${String(i).padStart(3, '0')}`,
        date: `2026-03-${String((i % 30) + 1).padStart(2, '0')}`,
      })
    );
    const { store } = mockLocalStore(many);

    const result = await getTransactions(store, { limit: 10 }, new Map());

    assert.strictEqual(result.pageInfo.hasNextPage, false);
    assert.strictEqual(result.pageInfo.hasPreviousPage, false);
  });

  it('propagates LocalStore errors (LOCAL_CACHE_MISSING)', async () => {
    const { store } = mockLocalStore([]);
    (
      store.getTransactions as unknown as {
        mock: { mockImplementation: (fn: () => Promise<Transaction[]>) => void };
      }
    ).mock.mockImplementation(async () => {
      throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'cache missing');
    });

    await assert.rejects(
      () => getTransactions(store, {}, new Map()),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });
});
