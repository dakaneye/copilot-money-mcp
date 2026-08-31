import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCachePath, firestoreRoot } from '../../src/localstore/path.js';

const FIRESTORE_SUBPATH =
  'Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT';

function makeHome(label: string): string {
  const home = join(tmpdir(), `copilot-mcp-test-${process.pid}-${label}`);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  return home;
}

/** Creates `<home>/…/__FIRAPP_DEFAULT/<instanceDir>/main` and returns it. */
function makeCache(home: string, instanceDir: string): string {
  const dir = join(home, FIRESTORE_SUBPATH, instanceDir, 'main');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('firestoreRoot', () => {
  test('points at the __FIRAPP_DEFAULT directory', () => {
    assert.strictEqual(firestoreRoot('/Users/alice'), join('/Users/alice', FIRESTORE_SUBPATH));
  });
});

describe('resolveCachePath', () => {
  test('resolves the projectId.databaseId instance directory', async () => {
    const home = makeHome('qualified');
    const expected = makeCache(home, 'copilot-production-22904.copilot-production-firestore');
    try {
      const resolved = await resolveCachePath({ home });
      assert.strictEqual(resolved, expected);
      assert.ok(existsSync(resolved));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('resolves a bare projectId instance directory', async () => {
    const home = makeHome('bare');
    const expected = makeCache(home, 'copilot-production-22904');
    try {
      assert.strictEqual(await resolveCachePath({ home }), expected);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('prefers the qualified instance directory over a stale bare one', async () => {
    const home = makeHome('both');
    makeCache(home, 'copilot-production-22904');
    const qualified = makeCache(home, 'copilot-production-22904.copilot-production-firestore');
    try {
      assert.strictEqual(await resolveCachePath({ home }), qualified);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('falls back to the bare directory when the qualified one has no main/', async () => {
    const home = makeHome('bare-fallback');
    const bare = makeCache(home, 'copilot-production-22904');
    mkdirSync(join(home, FIRESTORE_SUBPATH, 'copilot-production-22904.copilot-production-firestore'), {
      recursive: true,
    });
    try {
      assert.strictEqual(await resolveCachePath({ home }), bare);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('ignores instance directories for other projects', async () => {
    const home = makeHome('other-project');
    makeCache(home, 'some-other-project.other-firestore');
    try {
      await assert.rejects(
        () => resolveCachePath({ home }),
        (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('throws LOCAL_CACHE_MISSING when the instance directory has no main/', async () => {
    const home = makeHome('no-main');
    mkdirSync(join(home, FIRESTORE_SUBPATH, 'copilot-production-22904.copilot-production-firestore'), {
      recursive: true,
    });
    try {
      await assert.rejects(
        () => resolveCachePath({ home }),
        (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('throws LOCAL_CACHE_MISSING when the app was never installed', async () => {
    const home = makeHome('missing');
    try {
      await assert.rejects(
        () => resolveCachePath({ home }),
        (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
