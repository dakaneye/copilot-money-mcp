import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  categorizeTransaction,
  type CategorizeTransactionInput,
} from '../../src/tools/categorize.js';
import type { GraphQLClient } from '../../src/graphql/client.js';
import type { Transaction } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

/**
 * Regression test: AuthManager.getToken throws TOKEN_EXPIRED with an
 * actionable `copilot-auth login` hint when the stored token is expired.
 * Write tools surface that error verbatim via GraphQLClient.mutate — this
 * guard ensures future refactors don't drop the actionable CLI reference.
 */
describe('write tools surface actionable TOKEN_EXPIRED messages', () => {
  const transaction: Transaction = {
    id: 'txn_001',
    itemId: 'item_001',
    accountId: 'acc_001',
    name: 'UBER TRIP',
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
  };

  it('categorizeTransaction re-throws TOKEN_EXPIRED with copilot-auth login hint', async () => {
    const fakeClient = {
      mutate: async () => {
        throw new CopilotMoneyError(
          'TOKEN_EXPIRED',
          'Authentication expired. Run `copilot-auth login` in your terminal, then retry.'
        );
      },
    } as unknown as GraphQLClient;

    const input: CategorizeTransactionInput = {
      transaction_id: 'txn_001',
      category_name: 'Transportation',
    };
    const categoryMap = new Map([['transportation', 'cat_transport']]);

    await assert.rejects(
      () =>
        categorizeTransaction(fakeClient, input, transaction, categoryMap, [
          'Transportation',
        ]),
      (err: unknown) =>
        err instanceof CopilotMoneyError &&
        err.code === 'TOKEN_EXPIRED' &&
        err.message.includes('copilot-auth login')
    );
  });
});
