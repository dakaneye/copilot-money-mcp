import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { TRANSACTIONS_QUERY } from '../graphql/queries.js';
import type { Transaction, TransactionsPage, TransactionFilter } from '../types/index.js';

export const getTransactionsInputSchema = z
  .object({
    start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
    category: z.string().optional().describe('Category name to filter by'),
    merchant: z.string().optional().describe('Merchant name to search'),
    min_amount: z.number().optional().describe('Minimum amount'),
    max_amount: z.number().optional().describe('Maximum amount'),
    account: z.string().optional().describe('Account ID to filter by'),
    reviewed: z.boolean().optional().describe('Filter by reviewed status'),
    limit: z.number().optional().describe('Maximum transactions to return'),
  });

export type GetTransactionsInput = z.infer<typeof getTransactionsInputSchema>;

interface TransactionsResponse {
  transactions: {
    edges: Array<{ cursor: string; node: Transaction }>;
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
      endCursor: string | null;
    };
  };
}

export async function getTransactions(
  client: GraphQLClient,
  input: GetTransactionsInput,
  categoryMap: Map<string, string>
): Promise<TransactionsPage> {
  const filter: TransactionFilter = {};

  if (input.start_date) {
    filter.startDate = input.start_date;
  }
  if (input.end_date) {
    filter.endDate = input.end_date;
  }
  if (input.category) {
    const categoryId = categoryMap.get(input.category.toLowerCase());
    if (categoryId) {
      filter.categoryIds = [categoryId];
    }
  }
  if (input.merchant) {
    filter.search = input.merchant;
  }
  if (input.min_amount !== undefined) {
    filter.minAmount = input.min_amount;
  }
  if (input.max_amount !== undefined) {
    filter.maxAmount = input.max_amount;
  }
  if (input.account) {
    filter.accountIds = [input.account];
  }
  if (input.reviewed !== undefined) {
    filter.isReviewed = input.reviewed;
  }

  const response = await client.query<TransactionsResponse>(
    'Transactions',
    TRANSACTIONS_QUERY,
    {
      first: input.limit ?? 50,
      filter: Object.keys(filter).length > 0 ? filter : null,
      sort: [{ field: 'DATE', direction: 'DESC' }],
    }
  );

  return {
    transactions: response.transactions.edges.map((e) => e.node),
    pageInfo: response.transactions.pageInfo,
  };
}
