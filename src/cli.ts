#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  storeToken,
  storeCredentials,
  clearAll,
  getToken,
  getCredentials,
} from './auth/keychain.js';
import { automatedLogin, isPlaywrightAvailable } from './auth/playwright.js';
import * as readline from 'node:readline/promises';
import { SocketClient } from './auth/socket.js';
import { runDaemon } from './auth/daemon.js';

interface OpCredentials {
  email: string;
  password: string;
}

function tryGetCredentialsFromOp(item: string = 'Copilot'): OpCredentials | null {
  try {
    const result = execSync(`op item get "${item}" --format json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(result);
    const fields = data.fields as Array<{ id: string; value?: string }>;
    const email = fields.find((f) => f.id === 'username')?.value;
    const password = fields.find((f) => f.id === 'password')?.value;
    if (!email || !password) {
      return null;
    }
    return { email, password };
  } catch {
    return null;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (char: string): void => {
      if (char === '\n' || char === '\r') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        stdin.pause();
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u007F' || char === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (char === '\u0003') {
        process.stdout.write('\n');
        process.exit(1);
      } else {
        password += char;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
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

async function runLogin(opItem?: string): Promise<void> {
  if (!await isPlaywrightAvailable()) {
    console.error('Playwright is required for login.');
    console.error('Run: npx playwright install chromium');
    process.exit(1);
  }

  let email: string;
  let password: string;

  // Try 1Password first
  const opCreds = tryGetCredentialsFromOp(opItem);
  if (opCreds) {
    console.log(`Using credentials from 1Password for ${opCreds.email}`);
    email = opCreds.email;
    password = opCreds.password;
  } else {
    // Fall back to interactive input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    email = await rl.question('Email: ');
    rl.close();
    password = await readPassword('Password: ');

    if (!email || !password) {
      console.error('Email and password are required.');
      process.exit(1);
    }
  }

  console.log('\nLogging in (this takes ~15 seconds)...');

  try {
    // Store credentials for future automated refresh
    await storeCredentials({ email, password });

    // Run automated login to get token
    const result = await automatedLogin(email, password);
    await storeToken({ token: result.token, expiresAt: result.expiresAt });

    console.log(`Login successful (${formatTimeRemaining(result.expiresAt)}).`);
    console.log('Credentials and token stored securely in keychain.');

    // Start daemon if not running
    const client = new SocketClient();
    if (!await client.isRunning()) {
      console.log('Starting auth daemon...');
      await startDaemonBackground();
      console.log('Auth daemon started.');
    }
  } catch (error) {
    console.error(`\nLogin failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

async function runLogout(): Promise<void> {
  await clearAll();

  // Stop daemon if running
  const client = new SocketClient();
  if (await client.isRunning()) {
    console.log('Stopping auth daemon...');
    // The daemon will stop when it loses the socket
    // For now, just notify
  }

  console.log('Logged out. Credentials and tokens cleared from keychain.');
}

async function runStatus(): Promise<void> {
  const client = new SocketClient();

  // Check daemon status
  const daemonRunning = await client.isRunning();

  if (daemonRunning) {
    try {
      const status = await client.getStatus();
      console.log(`Status: ${status.authenticated ? 'Authenticated' : 'Not authenticated'}`);
      if (status.email) {
        console.log(`Email: ${status.email}`);
      }
      if (status.expiresAt) {
        console.log(`Token: ${formatTimeRemaining(new Date(status.expiresAt).getTime())}`);
      }
      console.log('Daemon: Running');
      const statusWithError = status as { lastError?: string };
      if (statusWithError.lastError) {
        console.log(`Last error: ${statusWithError.lastError}`);
      }
      return;
    } catch {
      // Fall through to local check
    }
  }

  // Daemon not running, check keychain directly
  const token = await getToken();
  const credentials = await getCredentials();

  if (!token) {
    console.log('Status: Not authenticated');
    console.log('Daemon: Not running');
    console.log("\nRun 'copilot-auth login' to authenticate.");
    return;
  }

  console.log(`Status: Authenticated`);
  if (credentials?.email) {
    console.log(`Email: ${credentials.email}`);
  }
  console.log(`Token: ${formatTimeRemaining(token.expiresAt)}`);
  console.log('Daemon: Not running');
  console.log("\nRun 'copilot-auth daemon start' to enable automatic token refresh.");
}

async function startDaemonBackground(): Promise<void> {
  const daemonScript = join(__dirname, 'auth', 'daemon.js');

  const child = spawn(process.execPath, [daemonScript, '--run'], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  // Wait for daemon to start
  const client = new SocketClient();
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await client.isRunning()) {
      return;
    }
  }

  throw new Error('Daemon failed to start');
}

async function runDaemonCommand(subcommand: string): Promise<void> {
  const client = new SocketClient();

  switch (subcommand) {
    case 'start': {
      if (await client.isRunning()) {
        console.log('Auth daemon is already running.');
        return;
      }
      await startDaemonBackground();
      console.log('Auth daemon started.');
      break;
    }

    case 'stop': {
      if (!await client.isRunning()) {
        console.log('Auth daemon is not running.');
        return;
      }
      // Send stop signal - daemon handles SIGTERM
      console.log('Stopping daemon... (use Ctrl+C or kill the process)');
      break;
    }

    case 'status': {
      if (await client.isRunning()) {
        const status = await client.getStatus();
        console.log('Daemon: Running');
        console.log(`Authenticated: ${status.authenticated}`);
        if (status.expiresAt) {
          console.log(`Token: ${formatTimeRemaining(new Date(status.expiresAt).getTime())}`);
        }
      } else {
        console.log('Daemon: Not running');
      }
      break;
    }

    case 'run': {
      // Run daemon in foreground (used internally)
      await runDaemon();
      break;
    }

    default:
      console.error(`Unknown daemon subcommand: ${subcommand}`);
      console.error('Usage: copilot-auth daemon [start|stop|status]');
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`Usage: copilot-auth <command> [options]

Commands:
  login [item]          Authenticate with Copilot Money
                        Tries 1Password first (item name, default: "Copilot")
                        Falls back to interactive prompt if op unavailable
  logout                Clear stored credentials and tokens
  status                Show authentication status

  daemon start          Start the token refresh daemon
  daemon stop           Stop the token refresh daemon
  daemon status         Check if daemon is running
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'login': {
      // Optional: specify 1Password item name as argument (default: "Copilot")
      const opItem = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
      await runLogin(opItem);
      break;
    }

    case 'logout':
      await runLogout();
      break;

    case 'status':
      await runStatus();
      break;

    case 'daemon':
      await runDaemonCommand(args[1] || 'status');
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
