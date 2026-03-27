#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  getAuthManager,
  getToken,
  storeToken,
  clearToken,
  isPlaywrightAvailable,
  captureTokenWithPlaywright,
  captureTokenWithEmailLink,
} from './auth/index.js';
import { GraphQLClient } from './graphql/client.js';
import { registerTools } from './tools/index.js';

function formatTimeRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  const minutes = Math.round(diff / 1000 / 60);

  if (minutes < 0) {
    const ago = Math.abs(minutes);
    if (ago < 60) return `expired ${ago} minutes ago`;
    const hours = Math.round(ago / 60);
    return `expired ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (minutes < 60) return `expires in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `expires in ${hours} hour${hours === 1 ? '' : 's'}`;
}

async function runLogin(): Promise<void> {
  const noBrowser = process.argv.includes('--no-browser');

  if (!noBrowser && await isPlaywrightAvailable()) {
    console.log('\nLaunching browser for Copilot Money login...');
    console.log('Log in normally. The token will be captured automatically.\n');

    try {
      const result = await captureTokenWithPlaywright();
      if (!result.expiresAt) {
        throw new Error('Token must have an expiration time');
      }
      await storeToken({
        token: result.token,
        expiresAt: result.expiresAt,
      });

      console.log(`\nLogin successful (${formatTimeRemaining(result.expiresAt)}). Token stored in keychain.`);
      return;
    } catch (error) {
      console.error(`\nBrowser login failed: ${error instanceof Error ? error.message : error}`);
      console.log('Falling back to email-link mode...\n');
    }
  }

  // Fallback: email-link mode
  if (!await isPlaywrightAvailable() && !noBrowser) {
    console.log('\nPlaywright not installed. Using email-link mode.');
    console.log('For automatic browser login, run: npx playwright install chromium\n');
  }

  try {
    const result = await captureTokenWithEmailLink();
    if (!result.expiresAt) {
      throw new Error('Token must have an expiration time');
    }
    await storeToken({
      token: result.token,
      expiresAt: result.expiresAt,
    });

    console.log(`\nLogin successful (${formatTimeRemaining(result.expiresAt)}). Token stored in keychain.`);
  } catch (error) {
    console.error(`\nLogin failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

async function runLogout(): Promise<void> {
  await clearToken();
  console.log('Token cleared from keychain.');
}

async function runStatus(): Promise<void> {
  const stored = await getToken();

  if (!stored) {
    console.log('Token: not configured');
    console.log("\nRun 'copilot-money-mcp login' to set up authentication.");
    return;
  }

  if (stored.expiresAt) {
    const now = Date.now();
    if (now > stored.expiresAt) {
      console.log(`Token: ${formatTimeRemaining(stored.expiresAt)}`);
      console.log("\nRun 'copilot-money-mcp login' to refresh.");
    } else {
      console.log(`Token: valid (${formatTimeRemaining(stored.expiresAt)})`);
    }
  } else {
    console.log('Token: configured (no expiry info)');
  }
}

async function runServer(): Promise<void> {
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

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'login':
      await runLogin();
      break;
    case 'logout':
      await runLogout();
      break;
    case 'status':
      await runStatus();
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(`Usage: copilot-money-mcp [command] [options]

Commands:
  login     Authenticate with Copilot Money
  logout    Clear stored token
  status    Check token status
  (none)    Run MCP server

Options:
  --no-browser    Skip browser automation, use email-link mode
`);
      break;
    default:
      await runServer();
      break;
  }
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
