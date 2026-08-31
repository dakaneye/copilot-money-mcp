import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CopilotMoneyError } from '../types/error.js';

const FIRESTORE_SUBPATH =
  'Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT';

const PROJECT_ID = 'copilot-production-22904';

/** The directory holding one subdirectory per Firestore instance. */
export function firestoreRoot(home: string): string {
  return join(home, FIRESTORE_SUBPATH);
}

/**
 * Locates the LevelDB directory backing Copilot's Firestore cache.
 *
 * Firestore names each instance directory `<projectId>.<databaseId>`, so the
 * cache lives at `copilot-production-22904.copilot-production-firestore/main`.
 * A bare `<projectId>` directory is also accepted, since that is the layout
 * older Firestore SDKs wrote.
 *
 * @throws {CopilotMoneyError} `LOCAL_CACHE_MISSING` if no populated instance exists.
 */
export async function resolveCachePath(deps: { home?: string } = {}): Promise<string> {
  const root = firestoreRoot(deps.home ?? homedir());

  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw new CopilotMoneyError(
        'LOCAL_CACHE_MISSING',
        `Could not read Copilot Money's cache directory at ${root}.`,
        undefined,
        { reason: (error as Error).message }
      );
    }
  }

  const hasMain = (entry: string): boolean => existsSync(join(root, entry, 'main'));

  // Prefer `<projectId>.<databaseId>`, which is what current Firestore SDKs
  // write, over a bare `<projectId>` directory left behind by an older app
  // version — that one may hold long-stale data.
  const match =
    entries
      .filter((entry) => entry.startsWith(`${PROJECT_ID}.`))
      .sort()
      .find(hasMain) ?? entries.filter((entry) => entry === PROJECT_ID).find(hasMain);

  if (!match) {
    throw new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      'Copilot Money not installed or never opened. Install it from the App Store and open it once, then retry.'
    );
  }

  return join(root, match, 'main');
}
