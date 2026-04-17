import { z } from 'zod';
import type { LocalStore, TransactionFilter } from '../localstore/index.js';
import type { Transaction, TransactionsPage } from '../types/index.js';

export const getTransactionsInputSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  category: z.string().optional().describe('Category name to filter by'),
  merchant: z
    .string()
    .optional()
    .describe('Merchant name to search (substring, case-insensitive)'),
  min_amount: z.number().optional().describe('Minimum amount'),
  max_amount: z.number().optional().describe('Maximum amount'),
  account: z.string().optional().describe('Account ID to filter by'),
  reviewed: z.boolean().optional().describe('Filter by reviewed status'),
  limit: z.number().optional().describe('Maximum transactions to return (default 50)'),
});

export type GetTransactionsInput = z.infer<typeof getTransactionsInputSchema>;

/**
 * Read transactions from the on-disk LocalStore cache.
 *
 * LocalStore natively filters by date range, category, account, and tag. The
 * remaining inputs (merchant name, min/max amount, reviewed status) are
 * applied in-memory here because the store doesn't index them.
 *
 * Pagination note: LocalStore returns a flat array, so we surface a
 * `pageInfo` with `hasNextPage: false` for shape parity with the old
 * GraphQL-backed tool. Cursor pagination over the local cache is a future
 * enhancement (see Phase 2).
 *
 * Tag/goal resolution note: `decodeTransaction` returns `tags: []` and
 * `goal: null` — LocalStore does not currently zip tag IDs back to their
 * names. Because the primary user has zero tags, this is acceptable for
 * Phase 1; resolving tags/goals requires changing `LocalStore.getTransactions`
 * to look up tag/goal IDs.
 */
export async function getTransactions(
  store: LocalStore,
  input: GetTransactionsInput,
  categoryMap: Map<string, string>
): Promise<TransactionsPage> {
  const filter: TransactionFilter = {};
  if (input.start_date) filter.since = input.start_date;
  if (input.end_date) filter.until = input.end_date;
  if (input.account) filter.accountId = input.account;
  if (input.category) {
    const categoryId = categoryMap.get(input.category.toLowerCase());
    if (categoryId) filter.categoryId = categoryId;
  }

  const requestedLimit = input.limit ?? 50;
  // Fetch broader than the user's limit so in-memory filters (merchant,
  // amount, reviewed) don't drop the final count below what they asked for.
  filter.limit = Math.max(200, requestedLimit * 4);

  let txns: Transaction[] = await store.getTransactions(filter);

  if (input.merchant) {
    const needle = input.merchant.toLowerCase();
    txns = txns.filter((t) => t.name.toLowerCase().includes(needle));
  }
  if (input.min_amount !== undefined) {
    const min = input.min_amount;
    txns = txns.filter((t) => t.amount >= min);
  }
  if (input.max_amount !== undefined) {
    const max = input.max_amount;
    txns = txns.filter((t) => t.amount <= max);
  }
  if (input.reviewed !== undefined) {
    const want = input.reviewed;
    txns = txns.filter((t) => t.isReviewed === want);
  }

  txns = txns.slice(0, requestedLimit);

  return {
    transactions: txns,
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  };
}
