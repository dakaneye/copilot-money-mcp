import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphQLClient } from '../graphql/client.js';
import type { LocalStore } from '../localstore/index.js';
import type { Category, Tag, Transaction } from '../types/index.js';
import type { TransactionsResponse } from '../types/responses.js';
import { CopilotMoneyError } from '../types/error.js';
import { TRANSACTIONS_QUERY } from '../graphql/queries.js';

// Read tools
import {
  getTransactions,
  getTransactionsInputSchema,
  type GetTransactionsInput,
} from './transactions.js';
import {
  getAccounts,
  getAccountsInputSchema,
  type GetAccountsInput,
} from './accounts.js';
import {
  getCategories,
  getCategoriesInputSchema,
  buildCategoryMap,
  type GetCategoriesInput,
} from './categories.js';
import { getTags, getTagsInputSchema, buildTagMap } from './tags.js';
import { getRecurring, getRecurringInputSchema } from './recurring.js';
import { getBudgets, getBudgetsInputSchema } from './budgets.js';

// Write tools
import {
  categorizeTransaction,
  categorizeTransactionInputSchema,
  type CategorizeTransactionInput,
} from './categorize.js';
import {
  reviewTransaction,
  reviewTransactionInputSchema,
  unreviewTransaction,
  unreviewTransactionInputSchema,
  type ReviewTransactionInput,
  type UnreviewTransactionInput,
} from './review.js';
import {
  tagTransaction,
  tagTransactionInputSchema,
  untagTransaction,
  untagTransactionInputSchema,
  type TagTransactionInput,
  type UntagTransactionInput,
} from './tag.js';

// Bulk tools
import {
  bulkCategorize,
  bulkCategorizeInputSchema,
  bulkTag,
  bulkTagInputSchema,
  bulkReview,
  bulkReviewInputSchema,
  type BulkCategorizeInput,
  type BulkTagInput,
  type BulkReviewInput,
} from './bulk.js';

// Smart tools
import {
  suggestCategories,
  suggestCategoriesInputSchema,
  type SuggestCategoriesInput,
} from './suggest.js';

// Cache with TTL
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface Cache<T> {
  data: T | null;
  expiresAt: number;
}

let categoryCache: Cache<Category[]> = { data: null, expiresAt: 0 };
let tagCache: Cache<Tag[]> = { data: null, expiresAt: 0 };
let categoryMap: Map<string, string> = new Map();
let tagMap: Map<string, string> = new Map();

function isCacheValid<T>(cache: Cache<T>): cache is Cache<T> & { data: T } {
  return cache.data !== null && Date.now() < cache.expiresAt;
}

async function refreshCategoryCache(store: LocalStore): Promise<void> {
  categoryCache.data = await getCategories(store, {});
  categoryCache.expiresAt = Date.now() + CACHE_TTL_MS;
  categoryMap = buildCategoryMap(categoryCache.data);
}

async function refreshTagCache(client: GraphQLClient): Promise<void> {
  tagCache.data = await getTags(client);
  tagCache.expiresAt = Date.now() + CACHE_TTL_MS;
  tagMap = buildTagMap(tagCache.data);
}

async function ensureCaches(
  client: GraphQLClient,
  store: LocalStore
): Promise<void> {
  const refreshes: Promise<void>[] = [];
  if (!isCacheValid(categoryCache)) {
    refreshes.push(refreshCategoryCache(store));
  }
  if (!isCacheValid(tagCache)) {
    refreshes.push(refreshTagCache(client));
  }
  if (refreshes.length > 0) {
    await Promise.all(refreshes);
  }
}

function getCategoryNames(): string[] {
  return categoryCache.data?.map((c) => c.name) ?? [];
}

function getTagNames(): string[] {
  return tagCache.data?.map((t) => t.name) ?? [];
}

async function fetchRecentTransactions(
  client: GraphQLClient,
  limit: number = 200
): Promise<Transaction[]> {
  const response = await client.query<TransactionsResponse>(
    'Transactions',
    TRANSACTIONS_QUERY,
    {
      first: limit,
      filter: null,
      sort: [{ field: 'DATE', direction: 'DESC' }],
    }
  );
  return response.transactions.edges.map((e) => e.node);
}

async function findTransaction(
  client: GraphQLClient,
  transactionId: string
): Promise<Transaction> {
  const transactions = await fetchRecentTransactions(client, 100);
  const txn = transactions.find((t) => t.id === transactionId);

  if (!txn) {
    throw new CopilotMoneyError(
      'TRANSACTION_NOT_FOUND',
      `Transaction ${transactionId} not found. Only the 100 most recent transactions are searchable.`
    );
  }

  return txn;
}

async function findTransactions(
  client: GraphQLClient,
  transactionIds: string[]
): Promise<Transaction[]> {
  const allTransactions = await fetchRecentTransactions(client, 200);
  const found: Transaction[] = [];
  const notFound: string[] = [];

  for (const id of transactionIds) {
    const txn = allTransactions.find((t) => t.id === id);
    if (txn) {
      found.push(txn);
    } else {
      notFound.push(id);
    }
  }

  if (notFound.length > 0) {
    throw new CopilotMoneyError(
      'TRANSACTION_NOT_FOUND',
      `Transactions not found: ${notFound.join(', ')}. Only the 200 most recent transactions are searchable.`
    );
  }

  return found;
}

function formatResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function formatError(
  error: unknown
): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  if (error instanceof CopilotMoneyError) {
    return {
      content: [{ type: 'text', text: JSON.stringify(error.toMcpError(), null, 2) }],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { code: 'UNKNOWN_ERROR', message: String(error) },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

export function registerTools(
  server: McpServer,
  client: GraphQLClient,
  localStore: LocalStore
): void {
  // READ TOOLS

  server.tool(
    'get_transactions',
    'Get transactions with optional filters for date, category, merchant, amount, account, and review status',
    getTransactionsInputSchema.shape,
    async (args: GetTransactionsInput) => {
      try {
        await ensureCaches(client, localStore);
        const result = await getTransactions(client, args, categoryMap);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'get_accounts',
    'Get all financial accounts with balances, optionally filtered by type',
    getAccountsInputSchema.shape,
    async (args: GetAccountsInput) => {
      try {
        const result = await getAccounts(localStore, args);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'get_categories',
    'Get all spending categories with optional spending totals',
    getCategoriesInputSchema.shape,
    async (args: GetCategoriesInput) => {
      try {
        const result = await getCategories(localStore, args);
        categoryCache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
        categoryMap = buildCategoryMap(result);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'get_tags',
    'Get all user-defined tags',
    getTagsInputSchema.shape,
    async () => {
      try {
        const result = await getTags(client);
        tagCache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
        tagMap = buildTagMap(result);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'get_recurring',
    'Get all recurring transactions (bills and subscriptions)',
    getRecurringInputSchema.shape,
    async () => {
      try {
        const result = await getRecurring(client);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'get_budgets',
    'Get budget information including limits and spending by category',
    getBudgetsInputSchema.shape,
    async () => {
      try {
        const result = await getBudgets(client);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // WRITE TOOLS

  server.tool(
    'categorize_transaction',
    'Assign a category to a transaction by name',
    categorizeTransactionInputSchema.shape,
    async (args: CategorizeTransactionInput) => {
      try {
        await ensureCaches(client, localStore);
        const transaction = await findTransaction(client, args.transaction_id);
        const result = await categorizeTransaction(
          client,
          args,
          transaction,
          categoryMap,
          getCategoryNames()
        );
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'review_transaction',
    'Mark a transaction as reviewed',
    reviewTransactionInputSchema.shape,
    async (args: ReviewTransactionInput) => {
      try {
        const transaction = await findTransaction(client, args.transaction_id);
        const result = await reviewTransaction(client, transaction);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'unreview_transaction',
    'Mark a transaction as not reviewed',
    unreviewTransactionInputSchema.shape,
    async (args: UnreviewTransactionInput) => {
      try {
        const transaction = await findTransaction(client, args.transaction_id);
        const result = await unreviewTransaction(client, transaction);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'tag_transaction',
    'Add tags to a transaction by name',
    tagTransactionInputSchema.shape,
    async (args: TagTransactionInput) => {
      try {
        await ensureCaches(client, localStore);
        const transaction = await findTransaction(client, args.transaction_id);
        const result = await tagTransaction(
          client,
          args,
          transaction,
          tagMap,
          getTagNames()
        );
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'untag_transaction',
    'Remove tags from a transaction by name',
    untagTransactionInputSchema.shape,
    async (args: UntagTransactionInput) => {
      try {
        await ensureCaches(client, localStore);
        const transaction = await findTransaction(client, args.transaction_id);
        const result = await untagTransaction(client, args, transaction, tagMap);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // BULK TOOLS

  server.tool(
    'bulk_categorize',
    'Assign a category to multiple transactions at once',
    bulkCategorizeInputSchema.shape,
    async (args: BulkCategorizeInput) => {
      try {
        await ensureCaches(client, localStore);
        const transactions = await findTransactions(client, args.transaction_ids);
        const result = await bulkCategorize(
          client,
          args,
          transactions,
          categoryMap,
          getCategoryNames()
        );
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'bulk_tag',
    'Add tags to multiple transactions at once',
    bulkTagInputSchema.shape,
    async (args: BulkTagInput) => {
      try {
        await ensureCaches(client, localStore);
        const transactions = await findTransactions(client, args.transaction_ids);
        const result = await bulkTag(client, args, transactions, tagMap, getTagNames());
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'bulk_review',
    'Mark multiple transactions as reviewed at once',
    bulkReviewInputSchema.shape,
    async (args: BulkReviewInput) => {
      try {
        const transactions = await findTransactions(client, args.transaction_ids);
        const result = await bulkReview(client, args, transactions);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // SMART TOOLS

  server.tool(
    'suggest_categories',
    'Get category suggestions for uncategorized transactions based on merchant patterns and Copilot Money suggestions',
    suggestCategoriesInputSchema.shape,
    async (args: SuggestCategoriesInput) => {
      try {
        const result = await suggestCategories(client, args);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );
}
