#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createKeychain } from './auth/keychain.js';
import {
  parseOobCodeFromUrl,
  sendOobCode,
  signInWithEmailLink,
} from './auth/firebaseRest.js';

const CONTINUE_URL = 'https://app.copilot.money';

export interface LoginDeps {
  firebaseRest: {
    sendOobCode: (p: { email: string; continueUrl: string }) => Promise<void>;
    signInWithEmailLink: (p: { email: string; oobCode: string }) => Promise<{
      idToken: string;
      refreshToken: string;
      email: string;
      localId: string;
      expiresAt: number;
    }>;
    parseOobCodeFromUrl: (url: string) => string;
  };
  keychain: {
    setToken: (v: {
      token: string;
      expiresAt: number;
      email: string;
      refreshToken: string;
    }) => Promise<void>;
  };
  prompt: (q: string) => Promise<string>;
  print: (s: string) => void;
}

export async function loginFlow(deps: LoginDeps): Promise<void> {
  const email = (await deps.prompt('Email: ')).trim();
  deps.print('Sending sign-in email...');
  await deps.firebaseRest.sendOobCode({ email, continueUrl: CONTINUE_URL });
  deps.print('Email sent. Open the email from Copilot and paste the sign-in URL here.');
  const pasted = await deps.prompt('URL: ');
  const oobCode = deps.firebaseRest.parseOobCodeFromUrl(pasted);
  const result = await deps.firebaseRest.signInWithEmailLink({ email, oobCode });
  await deps.keychain.setToken({
    token: result.idToken,
    expiresAt: result.expiresAt,
    email: result.email,
    refreshToken: result.refreshToken,
  });
  const minutes = Math.floor((result.expiresAt - Date.now()) / 60000);
  deps.print(`Logged in as ${result.email}. Token valid ~${minutes} min.`);
}

export const HELP_TEXT = `Usage: copilot-auth <command>

Commands:
  login                 Authenticate via magic-link email
  logout                Clear stored credentials and tokens
  status                Show authentication status
`;

function printHelp(): void {
  console.log(HELP_TEXT);
}

async function runLogin(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await loginFlow({
      firebaseRest: {
        sendOobCode,
        signInWithEmailLink,
        parseOobCodeFromUrl,
      },
      keychain: createKeychain(),
      prompt: (q) => rl.question(q),
      print: (s) => {
        console.log(s);
      },
    });
  } finally {
    rl.close();
  }
}

async function runStatus(): Promise<void> {
  const keychain = createKeychain();
  const stored = await keychain.getToken();
  if (!stored) {
    console.log('Not logged in. Run `copilot-auth login`.');
    return;
  }
  const remainingMs = stored.expiresAt - Date.now();
  if (remainingMs <= 0) {
    console.log(`Logged in as ${stored.email}. Token expired.`);
    return;
  }
  const minutes = Math.floor(remainingMs / 60000);
  console.log(`Logged in as ${stored.email}. Token valid ~${minutes} min.`);
}

async function runLogout(): Promise<void> {
  const keychain = createKeychain();
  await keychain.clearCredentials();
  console.log('Logged out. Cleared stored credentials.');
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'login':
      await runLogin();
      return;
    case 'status':
      await runStatus();
      return;
    case 'logout':
      await runLogout();
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

// Only run main() when invoked as the CLI entry point, not when imported by tests.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/cli.js') === true ||
  process.argv[1]?.endsWith('\\cli.js') === true;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error:', message);
    process.exit(1);
  });
}
