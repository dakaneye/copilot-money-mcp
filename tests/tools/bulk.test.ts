import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  bulkReview,
  bulkCategorize,
  bulkTag,
  type BulkReviewInput,
  type BulkCategorizeInput,
  type BulkTagInput,
} from '../../src/tools/bulk.js';
import { GraphQLClient } from '../../src/graphql/client.js';
import type { Transaction } from '../../src/types/index.js';

const createTransaction = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  itemId: 'item_001',
  accountId: 'acc_001',
  name: `Transaction ${id}`,
  amount: -25.5,
  date: '2026-03-20',
  type: 'debit',
  categoryId: 'cat_001',
  isReviewed: false,
  isPending: false,
  recurringId: null,
  suggestedCategoryIds: [],
  userNotes: null,
  tipAmount: null,
  createdAt: '2026-03-20T10:00:00Z',
  tags: [],
  goal: null,
  ...overrides,
});

describe('bulkReview', () => {
  let mockClient: GraphQLClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockClient = new GraphQLClient(async () => 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it('should return results from successful bulk mutation', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              bulkEditTransactions: {
                updated: [{ id: 'txn_001' }, { id: 'txn_002' }],
                failed: [],
              },
            },
          }),
          { status: 200 }
        )
      )
    ) as typeof fetch;

    const input: BulkReviewInput = { transaction_ids: ['txn_001', 'txn_002'] };
    const transactions = [createTransaction('txn_001'), createTransaction('txn_002')];

    const result = await bulkReview(mockClient, input, transactions);

    assert.strictEqual(result.updatedCount, 2);
    assert.deepStrictEqual(result.updatedIds, ['txn_001', 'txn_002']);
    assert.strictEqual(result.failed.length, 0);
  });

  it('should fall back to individual reviews when bulk fails', async () => {
    let callCount = 0;
    globalThis.fetch = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First call - bulk mutation fails with 400
        return Promise.resolve(new Response('Bulk endpoint rejected', { status: 400 }));
      }
      // Subsequent calls - individual reviews succeed
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              editTransaction: {
                transaction: { id: `txn_00${callCount - 1}`, isReviewed: true },
              },
            },
          }),
          { status: 200 }
        )
      );
    }) as typeof fetch;

    const input: BulkReviewInput = { transaction_ids: ['txn_001', 'txn_002'] };
    const transactions = [createTransaction('txn_001'), createTransaction('txn_002')];

    const result = await bulkReview(mockClient, input, transactions);

    assert.strictEqual(result.updatedCount, 2);
    assert.deepStrictEqual(result.updatedIds, ['txn_001', 'txn_002']);
    assert.strictEqual(result.failed.length, 0);
    // 1 bulk call + 2 individual calls = 3 total
    assert.strictEqual(callCount, 3);
  });

  it('should report individual failures during fallback', async () => {
    let callCount = 0;
    globalThis.fetch = mock.fn(() => {
      callCount++;
      if (callCount === 1) {
        // Bulk fails
        return Promise.resolve(new Response('Bulk endpoint rejected', { status: 400 }));
      }
      if (callCount === 2) {
        // First individual succeeds
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                editTransaction: {
                  transaction: { id: 'txn_001', isReviewed: true },
                },
              },
            }),
            { status: 200 }
          )
        );
      }
      // Second individual fails
      return Promise.resolve(new Response('Server error', { status: 500 }));
    }) as typeof fetch;

    const input: BulkReviewInput = { transaction_ids: ['txn_001', 'txn_002'] };
    const transactions = [createTransaction('txn_001'), createTransaction('txn_002')];

    const result = await bulkReview(mockClient, input, transactions);

    assert.strictEqual(result.updatedCount, 1);
    assert.deepStrictEqual(result.updatedIds, ['txn_001']);
    assert.strictEqual(result.failed.length, 1);
    assert.strictEqual(result.failed[0].transactionId, 'txn_002');
  });
});

describe('bulkCategorize', () => {
  let mockClient: GraphQLClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockClient = new GraphQLClient(async () => 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it('should categorize transactions with valid category', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              bulkEditTransactions: {
                updated: [{ id: 'txn_001' }],
                failed: [],
              },
            },
          }),
          { status: 200 }
        )
      )
    ) as typeof fetch;

    const input: BulkCategorizeInput = {
      transaction_ids: ['txn_001'],
      category_name: 'Groceries',
    };
    const transactions = [createTransaction('txn_001')];
    const categoryMap = new Map([['groceries', 'cat_groceries']]);

    const result = await bulkCategorize(
      mockClient,
      input,
      transactions,
      categoryMap,
      ['Groceries', 'Transport']
    );

    assert.strictEqual(result.updatedCount, 1);
    assert.deepStrictEqual(result.updatedIds, ['txn_001']);
  });

  it('should throw error for invalid category', async () => {
    const input: BulkCategorizeInput = {
      transaction_ids: ['txn_001'],
      category_name: 'NonExistent',
    };
    const transactions = [createTransaction('txn_001')];
    const categoryMap = new Map([['groceries', 'cat_groceries']]);

    await assert.rejects(
      () => bulkCategorize(mockClient, input, transactions, categoryMap, ['Groceries']),
      {
        name: 'CopilotMoneyError',
        message: "Category 'NonExistent' not found",
      }
    );
  });
});

describe('bulkTag', () => {
  let mockClient: GraphQLClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockClient = new GraphQLClient(async () => 'test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it('should tag transactions with valid tags', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              bulkEditTransactions: {
                updated: [{ id: 'txn_001' }],
                failed: [],
              },
            },
          }),
          { status: 200 }
        )
      )
    ) as typeof fetch;

    const input: BulkTagInput = {
      transaction_ids: ['txn_001'],
      tag_names: ['Essential'],
    };
    const transactions = [createTransaction('txn_001')];
    const tagMap = new Map([['essential', 'tag_essential']]);

    const result = await bulkTag(
      mockClient,
      input,
      transactions,
      tagMap,
      ['Essential', 'Optional']
    );

    assert.strictEqual(result.updatedCount, 1);
    assert.deepStrictEqual(result.updatedIds, ['txn_001']);
  });

  it('should throw error for invalid tags', async () => {
    const input: BulkTagInput = {
      transaction_ids: ['txn_001'],
      tag_names: ['NonExistent'],
    };
    const transactions = [createTransaction('txn_001')];
    const tagMap = new Map([['essential', 'tag_essential']]);

    await assert.rejects(
      () => bulkTag(mockClient, input, transactions, tagMap, ['Essential']),
      {
        name: 'CopilotMoneyError',
        message: 'Tags not found: NonExistent',
      }
    );
  });
});
