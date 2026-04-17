#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAuthManager } from './auth/manager.js';
import { createKeychain } from './auth/keychain.js';
import { GraphQLClient } from './graphql/client.js';
import {
  createLocalStore,
  type CacheStatus,
  type LocalStore,
} from './localstore/index.js';
import { registerTools } from './tools/index.js';
import { CopilotMoneyError } from './types/error.js';

/**
 * Returns a LocalStore stand-in whose reads throw LOCAL_CACHE_MISSING. Used
 * when the Copilot Money cache isn't present at server startup — write tools
 * still work, and read tools fail cleanly with actionable errors.
 *
 * `getCacheStatus` is deliberately a soft-fail: it returns a diagnostic
 * status object with zeroed counts and the failure reason in `error`. That
 * lets `get_cache_status` serve as a diagnostic tool even when the cache
 * couldn't be opened — its whole purpose is telling the user what went wrong.
 */
function cacheMissingStub(reason: string): LocalStore {
  const fail = async (): Promise<never> => {
    throw new CopilotMoneyError('LOCAL_CACHE_MISSING', reason);
  };
  const diagnosticStatus = async (): Promise<CacheStatus> => ({
    cacheLocation: '<unavailable>',
    entities: {
      accounts: { count: 0, lastUpdatedAt: null },
      categories: { count: 0, lastUpdatedAt: null },
      tags: { count: 0, lastUpdatedAt: null },
      transactions: { count: 0, lastUpdatedAt: null },
      recurring: { count: 0, lastUpdatedAt: null },
      budgets: { count: 0, lastUpdatedAt: null },
    },
    totalSizeBytes: 0,
    error: reason,
  });
  return {
    getAccounts: fail,
    getCategories: fail,
    getTags: fail,
    getTransactions: fail,
    getRecurring: fail,
    getBudgets: fail,
    getCacheStatus: diagnosticStatus,
    close: async () => {},
  };
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'copilot-money-mcp',
    version: '2.0.0',
  });

  const authManager = createAuthManager({ keychain: createKeychain() });

  const graphqlClient = new GraphQLClient(() => authManager.getToken());

  let localStore: LocalStore;
  try {
    localStore = await createLocalStore();
  } catch (err) {
    if (err instanceof CopilotMoneyError && err.code === 'LOCAL_CACHE_MISSING') {
      console.error(
        '[copilot-money-mcp] Local cache not found. Read tools will fail until the Copilot Money Mac app is installed and opened. Write tools still work.'
      );
      localStore = cacheMissingStub(err.message);
    } else {
      throw err;
    }
  }

  registerTools(server, graphqlClient, localStore);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Copilot Money MCP server running on stdio');
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
