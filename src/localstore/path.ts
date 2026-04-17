import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CopilotMoneyError } from '../types/error.js';

const CACHE_SUBPATH =
  'Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main';

export function defaultCacheRoot(home: string): string {
  return join(home, CACHE_SUBPATH);
}

export async function resolveCachePath(deps: { home?: string } = {}): Promise<string> {
  const home = deps.home ?? homedir();
  const path = defaultCacheRoot(home);
  if (!existsSync(path)) {
    throw new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      'Copilot Money not installed or never opened. Install it from the App Store and open it once, then retry.'
    );
  }
  return path;
}
