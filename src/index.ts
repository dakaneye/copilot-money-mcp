#!/usr/bin/env node

import { execFile } from 'node:child_process';
import * as readline from 'node:readline';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthManager, getStoredTokens, storeTokens, clearTokens } from './auth/index.js';
import { GraphQLClient } from './graphql/client.js';
import { registerTools } from './tools/index.js';

function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

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

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' :
              'xdg-open';
  execFile(cmd, [url], (error) => {
    if (error) {
      console.error(`Please open this URL manually: ${url}`);
    }
  });
}

async function promptForToken(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Token: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runLogin(): Promise<void> {
  console.log('\nOpening Copilot Money in your browser...\n');
  openBrowser('https://app.copilot.money');

  console.log('To get your authentication token:');
  console.log('1. Log in to Copilot Money in your browser');
  console.log('2. Open DevTools (Cmd+Option+I) → Network tab');
  console.log('3. Click any request → Headers → copy "Authorization: Bearer ..." value');
  console.log('4. Paste the token below (without "Bearer " prefix)\n');

  const token = await promptForToken();

  if (!token) {
    console.error('No token provided.');
    process.exit(1);
  }

  if (token.startsWith('Bearer ')) {
    console.error('Please paste only the token, without "Bearer " prefix.');
    process.exit(1);
  }

  const expiresAt = parseJwtExpiry(token);
  if (expiresAt && expiresAt < Date.now()) {
    console.error('This token is already expired. Please get a fresh token.');
    process.exit(1);
  }

  await storeTokens({
    accessToken: token,
    refreshToken: null,
    expiresAt,
  });

  if (expiresAt) {
    const remaining = formatTimeRemaining(expiresAt);
    console.log(`\nToken valid (${remaining}). Stored in keychain.`);
  } else {
    console.log('\nToken stored in keychain.');
  }
}

async function runLogout(): Promise<void> {
  await clearTokens();
  console.log('Token cleared from keychain.');
}

async function runStatus(): Promise<void> {
  const stored = await getStoredTokens();

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
      console.log(`Usage: copilot-money-mcp [command]

Commands:
  login     Store authentication token
  logout    Clear stored token
  status    Check token status
  (none)    Run MCP server
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
