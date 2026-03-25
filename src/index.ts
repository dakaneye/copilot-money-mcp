#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthManager } from './auth/index.js';
import { GraphQLClient } from './graphql/client.js';
import { registerTools } from './tools/index.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'copilot-money-mcp',
    version: '0.1.0',
  });

  const authManager = getAuthManager();

  const graphqlClient = new GraphQLClient(
    () => authManager.ensureAuthenticated(),
    () => authManager.handleAuthError()
  );

  registerTools(server, graphqlClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Copilot Money MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
