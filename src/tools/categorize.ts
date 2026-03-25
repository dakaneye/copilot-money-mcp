import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { EDIT_TRANSACTION_MUTATION } from '../graphql/mutations.js';
import type { Transaction } from '../types/index.js';
import { CopilotMoneyError } from '../types/error.js';

export const categorizeTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
  category_name: z.string().describe('The category name to assign'),
});

export type CategorizeTransactionInput = z.infer<typeof categorizeTransactionInputSchema>;

interface EditTransactionResponse {
  editTransaction: {
    transaction: Transaction;
  };
}

export async function categorizeTransaction(
  client: GraphQLClient,
  input: CategorizeTransactionInput,
  transaction: Transaction,
  categoryMap: Map<string, string>,
  categoryNames: string[]
): Promise<Transaction> {
  const categoryId = categoryMap.get(input.category_name.toLowerCase());

  if (!categoryId) {
    throw new CopilotMoneyError(
      'INVALID_CATEGORY',
      `Category '${input.category_name}' not found`,
      categoryNames.slice(0, 10)
    );
  }

  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        categoryId,
      },
    }
  );

  return response.editTransaction.transaction;
}
