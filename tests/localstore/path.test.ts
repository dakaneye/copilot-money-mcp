import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCachePath, defaultCacheRoot } from '../../src/localstore/path.js';

describe('resolveCachePath', () => {
  test('returns the Copilot Money Firestore main dir path string', () => {
    const p = defaultCacheRoot('/Users/alice');
    assert.strictEqual(
      p,
      '/Users/alice/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main'
    );
  });

  test('throws LOCAL_CACHE_MISSING when directory does not exist', async () => {
    const fakeHome = join(tmpdir(), `copilot-mcp-test-${Date.now()}`);
    mkdirSync(fakeHome, { recursive: true });
    try {
      await assert.rejects(
        () => resolveCachePath({ home: fakeHome }),
        (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
      );
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('returns path when directory exists', async () => {
    const fakeHome = join(tmpdir(), `copilot-mcp-test-${Date.now()}-ok`);
    const cacheDir = join(
      fakeHome,
      'Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main'
    );
    mkdirSync(cacheDir, { recursive: true });
    try {
      const resolved = await resolveCachePath({ home: fakeHome });
      assert.strictEqual(resolved, cacheDir);
      assert.ok(existsSync(resolved));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
