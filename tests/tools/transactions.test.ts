import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getTransactions, type GetTransactionsInput } from '../../src/tools/transactions.js';
import { GraphQLClient } from '../../src/graphql/client.js';

const fixtures = {
  transactions: {
    edges: [
      {
        cursor: 'cursor1',
        node: {
          id: 'txn_001',
          itemId: 'item_001',
          accountId: 'acc_001',
          name: 'UBER TRIP',
          amount: -25.50,
          date: '2026-03-20',
          type: 'debit' as const,
          categoryId: 'cat_transport',
          isReviewed: false,
          isPending: false,
          recurringId: null,
          suggestedCategoryIds: ['cat_transport'],
          userNotes: null,
          tipAmount: null,
          createdAt: '2026-03-20T10:00:00Z',
          tags: [],
          goal: null,
        },
      },
      {
        cursor: 'cursor2',
        node: {
          id: 'txn_002',
          itemId: 'item_001',
          accountId: 'acc_001',
          name: 'WHOLE FOODS',
          amount: -85.23,
          date: '2026-03-19',
          type: 'debit' as const,
          categoryId: 'cat_groceries',
          isReviewed: true,
          isPending: false,
          recurringId: null,
          suggestedCategoryIds: [],
          userNotes: null,
          tipAmount: null,
          createdAt: '2026-03-19T15:30:00Z',
          tags: [{ id: 'tag_001', name: 'essential', colorName: 'blue' }],
          goal: null,
        },
      },
    ],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: 'cursor1',
      endCursor: 'cursor2',
    },
  },
};

describe('getTransactions tool', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return transactions from GraphQL response', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const categoryMap = new Map<string, string>();
    const input: GetTransactionsInput = {};

    const result = await getTransactions(client, input, categoryMap);

    assert.strictEqual(result.transactions.length, 2);
    assert.strictEqual(result.transactions[0].id, 'txn_001');
    assert.strictEqual(result.transactions[0].name, 'UBER TRIP');
    assert.strictEqual(result.transactions[0].amount, -25.50);
  });

  it('should filter transactions by category', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const categoryMap = new Map<string, string>([
      ['transport', 'cat_transport']
    ]);
    const input: GetTransactionsInput = { category: 'transport' };

    const result = await getTransactions(client, input, categoryMap);

    assert.strictEqual(result.transactions.length, 2);
  });

  it('should limit transactions', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const categoryMap = new Map<string, string>();
    const input: GetTransactionsInput = { limit: 25 };

    const result = await getTransactions(client, input, categoryMap);

    assert.strictEqual(result.transactions.length, 2);
  });

  it('should handle filter by reviewed status', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const categoryMap = new Map<string, string>();
    const input: GetTransactionsInput = { reviewed: true };

    const result = await getTransactions(client, input, categoryMap);

    assert.strictEqual(result.transactions.length, 2);
  });

  it('should return page info from response', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const categoryMap = new Map<string, string>();
    const input: GetTransactionsInput = {};

    const result = await getTransactions(client, input, categoryMap);

    assert.strictEqual(result.pageInfo.hasNextPage, false);
    assert.strictEqual(result.pageInfo.endCursor, 'cursor2');
  });

  it('should filter by amount range', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const categoryMap = new Map<string, string>();
    const input: GetTransactionsInput = { min_amount: -100, max_amount: -20 };

    const result = await getTransactions(client, input, categoryMap);

    assert.strictEqual(result.transactions.length, 2);
  });
});
