import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { BULK_EDIT_TRANSACTIONS_MUTATION } from '../graphql/mutations.js';
import { CopilotMoneyError } from '../types/error.js';
import type { Transaction } from '../types/index.js';
import { reviewTransaction } from './review.js';

interface BulkTransaction {
  id: string;
}

// The API requires full transaction references, not just IDs
interface TransactionIdRef {
  id: string;
  accountId: string;
  itemId: string;
}

function buildTransactionRefs(transactions: Transaction[]): TransactionIdRef[] {
  return transactions.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    itemId: t.itemId,
  }));
}

export const bulkCategorizeInputSchema = z.object({
  transaction_ids: z.array(z.string()).describe('Transaction IDs to categorize'),
  category_name: z.string().describe('Category name to assign'),
});

export type BulkCategorizeInput = z.infer<typeof bulkCategorizeInputSchema>;

export const bulkTagInputSchema = z.object({
  transaction_ids: z.array(z.string()).describe('Transaction IDs to tag'),
  tag_names: z.array(z.string()).describe('Tag names to add'),
});

export type BulkTagInput = z.infer<typeof bulkTagInputSchema>;

export const bulkReviewInputSchema = z.object({
  transaction_ids: z.array(z.string()).describe('Transaction IDs to mark as reviewed'),
});

export type BulkReviewInput = z.infer<typeof bulkReviewInputSchema>;

interface BulkEditResponse {
  bulkEditTransactions: {
    updated: BulkTransaction[];
    failed: Array<{
      transaction: BulkTransaction;
      error: string;
      errorCode: string;
    }>;
  };
}

export interface BulkResult {
  updatedCount: number;
  updatedIds: string[];
  failed: Array<{
    transactionId: string;
    error: string;
  }>;
}

export async function bulkCategorize(
  client: GraphQLClient,
  input: BulkCategorizeInput,
  transactions: Transaction[],
  categoryMap: Map<string, string>,
  categoryNames: string[]
): Promise<BulkResult> {
  const categoryId = categoryMap.get(input.category_name.toLowerCase());

  if (!categoryId) {
    throw new CopilotMoneyError(
      'INVALID_CATEGORY',
      `Category '${input.category_name}' not found`,
      categoryNames.slice(0, 10)
    );
  }

  const transactionRefs = buildTransactionRefs(transactions);

  const response = await client.mutate<BulkEditResponse>(
    'BulkEditTransactions',
    BULK_EDIT_TRANSACTIONS_MUTATION,
    {
      filter: {
        ids: transactionRefs,
      },
      input: {
        categoryId,
      },
    }
  );

  return {
    updatedCount: response.bulkEditTransactions.updated.length,
    updatedIds: response.bulkEditTransactions.updated.map((t) => t.id),
    failed: response.bulkEditTransactions.failed.map((f) => ({
      transactionId: f.transaction.id,
      error: f.error,
    })),
  };
}

export async function bulkTag(
  client: GraphQLClient,
  input: BulkTagInput,
  transactions: Transaction[],
  tagMap: Map<string, string>,
  tagNames: string[]
): Promise<BulkResult> {
  const tagIds: string[] = [];
  const invalidTags: string[] = [];

  for (const name of input.tag_names) {
    const tagId = tagMap.get(name.toLowerCase());
    if (tagId) {
      tagIds.push(tagId);
    } else {
      invalidTags.push(name);
    }
  }

  if (invalidTags.length > 0) {
    throw new CopilotMoneyError(
      'INVALID_TAG',
      `Tags not found: ${invalidTags.join(', ')}`,
      tagNames.slice(0, 10)
    );
  }

  const transactionRefs = buildTransactionRefs(transactions);

  const response = await client.mutate<BulkEditResponse>(
    'BulkEditTransactions',
    BULK_EDIT_TRANSACTIONS_MUTATION,
    {
      filter: {
        ids: transactionRefs,
      },
      input: {
        tagIds,
      },
    }
  );

  return {
    updatedCount: response.bulkEditTransactions.updated.length,
    updatedIds: response.bulkEditTransactions.updated.map((t) => t.id),
    failed: response.bulkEditTransactions.failed.map((f) => ({
      transactionId: f.transaction.id,
      error: f.error,
    })),
  };
}

// Process items in parallel with concurrency limit
async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function bulkReview(
  client: GraphQLClient,
  _input: BulkReviewInput,
  transactions: Transaction[]
): Promise<BulkResult> {
  // Skip unreliable bulk endpoint - use parallel individual reviews
  // Copilot Money's bulk endpoint silently fails for transactions older than ~5 days
  const CONCURRENCY = 5;

  const updatedIds: string[] = [];
  const failed: Array<{ transactionId: string; error: string }> = [];

  await parallelLimit(transactions, CONCURRENCY, async (txn) => {
    try {
      await reviewTransaction(client, txn);
      updatedIds.push(txn.id);
    } catch (error) {
      failed.push({
        transactionId: txn.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    updatedCount: updatedIds.length,
    updatedIds,
    failed,
  };
}
