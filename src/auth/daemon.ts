import { CopilotMoneyError } from '../types/error.js';

// This module is a temporary stub during the local-cache-rewrite refactor.
// Task 28 deletes this file entirely once the magic-link CLI flow (Task 9) is
// wired up and the socket-based daemon becomes obsolete. Until then, keep the
// public surface compiling but reject any attempt to run the legacy
// password-refresh daemon.

function disabled(): never {
  throw new CopilotMoneyError(
    'NOT_AUTHENTICATED',
    'Legacy password-refresh daemon is disabled. Run `copilot-auth login`.'
  );
}

export function createDaemon(): never {
  disabled();
}

export function runDaemon(): never {
  disabled();
}

// Run if invoked directly — still reject loudly so the detached daemon process
// exits with a non-zero code instead of silently sitting on the socket.
if (process.argv[1]?.endsWith('daemon.js') && process.argv.includes('--run')) {
  console.error(
    '[daemon] Legacy password-refresh daemon is disabled during refactor.'
  );
  process.exit(1);
}
