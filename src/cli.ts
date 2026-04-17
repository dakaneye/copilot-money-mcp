#!/usr/bin/env node

import { CopilotMoneyError } from './types/error.js';

// This file is a temporary stub during the local-cache-rewrite refactor.
// Task 9 rewrites it as the magic-link login CLI (send OOB code, exchange for
// tokens, store refresh token). Until then, keep the build green but reject any
// runtime invocation with a clear message so nobody is surprised.

const DISABLED_MESSAGE =
  'Legacy CLI flow is disabled during refactor (Task 9 rewrites this). Build green; not runtime usable.';

function printHelp(): void {
  console.log(`Usage: copilot-auth <command> [options]

Commands:
  login [item]          Authenticate with Copilot Money
  logout                Clear stored credentials and tokens
  status                Show authentication status
  daemon [sub]          Token refresh daemon

NOTE: ${DISABLED_MESSAGE}
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;

    case 'login':
    case 'logout':
    case 'status':
    case 'daemon':
      throw new CopilotMoneyError('NOT_AUTHENTICATED', DISABLED_MESSAGE);

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Error:', message);
  process.exit(1);
});
