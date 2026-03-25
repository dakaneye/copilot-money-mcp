import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { EDIT_TRANSACTION_MUTATION } from '../graphql/mutations.js';
import type { Transaction } from '../types/index.js';

export const reviewTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
});

export type ReviewTransactionInput = z.infer<typeof reviewTransactionInputSchema>;

export const unreviewTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
});

export type UnreviewTransactionInput = z.infer<typeof unreviewTransactionInputSchema>;

interface EditTransactionResponse {
  editTransaction: {
    transaction: Transaction;
  };
}

export async function reviewTransaction(
  client: GraphQLClient,
  transaction: Transaction
): Promise<Transaction> {
  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        isReviewed: true,
      },
    }
  );

  return response.editTransaction.transaction;
}

export async function unreviewTransaction(
  client: GraphQLClient,
  transaction: Transaction
): Promise<Transaction> {
  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        isReviewed: false,
      },
    }
  );

  return response.editTransaction.transaction;
}
