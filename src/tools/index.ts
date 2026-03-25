import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphQLClient } from '../graphql/client.js';
import type { Category, Tag, Transaction } from '../types/index.js';
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
import {
  getBudgets,
  getBudgetsInputSchema,
  type GetBudgetsInput,
} from './budgets.js';

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

// Cache for categories and tags
let cachedCategories: Category[] | null = null;
let cachedTags: Tag[] | null = null;
let categoryMap: Map<string, string> = new Map();
let tagMap: Map<string, string> = new Map();

async function refreshCategoryCache(client: GraphQLClient): Promise<void> {
  cachedCategories = await getCategories(client, {});
  categoryMap = buildCategoryMap(cachedCategories);
}

async function refreshTagCache(client: GraphQLClient): Promise<void> {
  cachedTags = await getTags(client);
  tagMap = buildTagMap(cachedTags);
}

async function ensureCaches(client: GraphQLClient): Promise<void> {
  if (!cachedCategories) {
    await refreshCategoryCache(client);
  }
  if (!cachedTags) {
    await refreshTagCache(client);
  }
}

function getCategoryNames(): string[] {
  return cachedCategories?.map((c) => c.name) ?? [];
}

function getTagNames(): string[] {
  return cachedTags?.map((t) => t.name) ?? [];
}

interface TransactionsResponse {
  transactions: {
    edges: Array<{ node: Transaction }>;
  };
}

async function findTransaction(
  client: GraphQLClient,
  transactionId: string
): Promise<Transaction> {
  // Fetch recent transactions and search for the ID
  const response = await client.query<TransactionsResponse>(
    'Transactions',
    TRANSACTIONS_QUERY,
    {
      first: 100,
      filter: null,
      sort: [{ field: 'DATE', direction: 'DESC' }],
    }
  );

  const txn = response.transactions.edges.find(
    (e) => e.node.id === transactionId
  )?.node;

  if (!txn) {
    throw new CopilotMoneyError(
      'TRANSACTION_NOT_FOUND',
      `Transaction ${transactionId} not found in recent transactions`
    );
  }

  return txn;
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

export function registerTools(server: McpServer, client: GraphQLClient): void {
  // ============================================
  // READ TOOLS
  // ============================================

  server.tool(
    'get_transactions',
    'Get transactions with optional filters for date, category, merchant, amount, account, and review status',
    getTransactionsInputSchema.shape,
    async (args: GetTransactionsInput) => {
      try {
        await ensureCaches(client);
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
        const result = await getAccounts(client, args);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    'get_categories',
    'Get all spending categories with optional spending totals for a given period',
    getCategoriesInputSchema.shape,
    async (args: GetCategoriesInput) => {
      try {
        const result = await getCategories(client, args);
        // Update cache
        cachedCategories = result;
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
        // Update cache
        cachedTags = result;
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
    async (args: GetBudgetsInput) => {
      try {
        const result = await getBudgets(client, args);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================
  // WRITE TOOLS
  // ============================================

  server.tool(
    'categorize_transaction',
    'Assign a category to a transaction by name',
    categorizeTransactionInputSchema.shape,
    async (args: CategorizeTransactionInput) => {
      try {
        await ensureCaches(client);
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
        await ensureCaches(client);
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
        await ensureCaches(client);
        const transaction = await findTransaction(client, args.transaction_id);
        const result = await untagTransaction(client, args, transaction, tagMap);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================
  // BULK TOOLS
  // ============================================

  server.tool(
    'bulk_categorize',
    'Assign a category to multiple transactions at once',
    bulkCategorizeInputSchema.shape,
    async (args: BulkCategorizeInput) => {
      try {
        await ensureCaches(client);
        const result = await bulkCategorize(
          client,
          args,
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
        await ensureCaches(client);
        const result = await bulkTag(client, args, tagMap, getTagNames());
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
        const result = await bulkReview(client, args);
        return formatResult(result);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================
  // SMART TOOLS
  // ============================================

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

// Export cache management for potential external use
export { refreshCategoryCache, refreshTagCache, ensureCaches };
