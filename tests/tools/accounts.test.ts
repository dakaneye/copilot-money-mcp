import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getAccounts, type GetAccountsInput } from '../../src/tools/accounts.js';
import type { LocalStore } from '../../src/localstore/index.js';
import type { Account } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(accounts: Account[]): LocalStore {
  return {
    getAccounts: mock.fn(async () => accounts),
    getCategories: mock.fn(async () => []),
    getTags: mock.fn(async () => []),
    getTransactions: mock.fn(async () => []),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: accounts.length, lastUpdatedAt: null },
        categories: { count: 0, lastUpdatedAt: null },
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

function account(partial: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    itemId: 'i1',
    name: 'Checking',
    type: 'checking',
    subType: null,
    balance: 1000,
    liveBalance: null,
    hasLiveBalance: false,
    limit: null,
    mask: null,
    color: null,
    institutionId: null,
    isManual: false,
    isUserHidden: false,
    isUserClosed: false,
    latestBalanceUpdate: null,
    hasHistoricalUpdates: false,
    ...partial,
  };
}

describe('getAccounts tool', () => {
  it('returns visible, open accounts from LocalStore', async () => {
    const store = mockLocalStore([
      account({ id: 'acc_001', name: 'Chase Checking', type: 'checking' }),
      account({ id: 'acc_002', name: 'Savings Account', type: 'savings' }),
    ]);

    const input: GetAccountsInput = {};
    const result = await getAccounts(store, input);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'acc_001');
    assert.strictEqual(result[1].id, 'acc_002');
  });

  it('filters accounts by type (checking)', async () => {
    const store = mockLocalStore([
      account({ id: 'acc_001', type: 'checking' }),
      account({ id: 'acc_002', type: 'savings' }),
    ]);

    const result = await getAccounts(store, { type: 'checking' });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'acc_001');
    assert.strictEqual(result[0].type, 'checking');
  });

  it('filters accounts by type (savings)', async () => {
    const store = mockLocalStore([
      account({ id: 'acc_001', type: 'checking' }),
      account({ id: 'acc_002', type: 'savings' }),
    ]);

    const result = await getAccounts(store, { type: 'savings' });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'acc_002');
    assert.strictEqual(result[0].type, 'savings');
  });

  it('excludes hidden accounts', async () => {
    const store = mockLocalStore([
      account({ id: 'acc_001', name: 'Visible' }),
      account({ id: 'acc_003', name: 'Hidden', isUserHidden: true }),
    ]);

    const result = await getAccounts(store, {});

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result.find((a) => a.id === 'acc_003'), undefined);
  });

  it('excludes closed accounts', async () => {
    const store = mockLocalStore([
      account({ id: 'acc_001', name: 'Open' }),
      account({ id: 'acc_004', name: 'Closed', isUserClosed: true }),
    ]);

    const result = await getAccounts(store, {});

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result.find((a) => a.id === 'acc_004'), undefined);
  });

  it('returns empty array when no accounts match the filter', async () => {
    const store = mockLocalStore([
      account({ id: 'acc_001', type: 'checking' }),
      account({ id: 'acc_002', type: 'savings' }),
    ]);

    const result = await getAccounts(store, { type: 'credit' });

    assert.strictEqual(result.length, 0);
  });

  it('propagates LocalStore errors (LOCAL_CACHE_MISSING)', async () => {
    const store = mockLocalStore([]);
    (
      store.getAccounts as unknown as {
        mock: { mockImplementation: (fn: () => Promise<Account[]>) => void };
      }
    ).mock.mockImplementation(async () => {
      throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'cache missing');
    });

    await assert.rejects(
      () => getAccounts(store, {}),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });
});
