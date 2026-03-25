import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getAccounts, type GetAccountsInput } from '../../src/tools/accounts.js';
import { GraphQLClient } from '../../src/graphql/client.js';

const fixtures = {
  accounts: [
    {
      id: 'acc_001',
      itemId: 'item_001',
      name: 'Chase Checking',
      type: 'checking',
      subType: 'personal',
      balance: 5000.00,
      liveBalance: 4800.00,
      hasLiveBalance: true,
      limit: null,
      mask: '1234',
      color: 'blue',
      institutionId: 'inst_chase',
      isManual: false,
      isUserHidden: false,
      isUserClosed: false,
      latestBalanceUpdate: '2026-03-25T10:00:00Z',
      hasHistoricalUpdates: true,
    },
    {
      id: 'acc_002',
      itemId: 'item_002',
      name: 'Savings Account',
      type: 'savings',
      subType: 'personal',
      balance: 10000.00,
      liveBalance: 10000.00,
      hasLiveBalance: true,
      limit: null,
      mask: '5678',
      color: 'green',
      institutionId: 'inst_ally',
      isManual: false,
      isUserHidden: false,
      isUserClosed: false,
      latestBalanceUpdate: '2026-03-25T10:00:00Z',
      hasHistoricalUpdates: true,
    },
    {
      id: 'acc_003',
      itemId: 'item_003',
      name: 'Hidden Account',
      type: 'checking',
      subType: 'personal',
      balance: 500.00,
      liveBalance: 500.00,
      hasLiveBalance: true,
      limit: null,
      mask: '9999',
      color: null,
      institutionId: 'inst_local',
      isManual: false,
      isUserHidden: true,
      isUserClosed: false,
      latestBalanceUpdate: '2026-03-25T10:00:00Z',
      hasHistoricalUpdates: false,
    },
    {
      id: 'acc_004',
      itemId: 'item_004',
      name: 'Closed Account',
      type: 'savings',
      subType: 'personal',
      balance: 0.00,
      liveBalance: null,
      hasLiveBalance: false,
      limit: null,
      mask: '0000',
      color: null,
      institutionId: 'inst_old',
      isManual: false,
      isUserHidden: false,
      isUserClosed: true,
      latestBalanceUpdate: '2026-03-20T10:00:00Z',
      hasHistoricalUpdates: true,
    },
  ],
};

describe('getAccounts tool', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return visible, open accounts from GraphQL response', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetAccountsInput = {};

    const result = await getAccounts(client, input);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'acc_001');
    assert.strictEqual(result[1].id, 'acc_002');
  });

  it('should filter accounts by type', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetAccountsInput = { type: 'checking' };

    const result = await getAccounts(client, input);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'acc_001');
    assert.strictEqual(result[0].type, 'checking');
  });

  it('should filter accounts by savings type', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetAccountsInput = { type: 'savings' };

    const result = await getAccounts(client, input);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'acc_002');
    assert.strictEqual(result[0].type, 'savings');
  });

  it('should exclude hidden accounts', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetAccountsInput = {};

    const result = await getAccounts(client, input);

    const hiddenAccount = result.find(a => a.id === 'acc_003');
    assert.strictEqual(hiddenAccount, undefined);
  });

  it('should exclude closed accounts', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetAccountsInput = {};

    const result = await getAccounts(client, input);

    const closedAccount = result.find(a => a.id === 'acc_004');
    assert.strictEqual(closedAccount, undefined);
  });

  it('should return empty array when no matching type', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetAccountsInput = { type: 'credit' };

    const result = await getAccounts(client, input);

    assert.strictEqual(result.length, 0);
  });
});
