import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { openReadOnly } from '../../src/localstore/leveldb.js';

// The committed fixture lives at <repo>/tests/fixtures/leveldb-sample. Tests
// never open it in place — opening a LevelDB mutates the directory (log
// rotation, new manifest, etc.) and would churn git. Instead, each test
// copies the fixture to a fresh temp dir, matching Task 19's facade policy.
const FIXTURE_SRC = join(process.cwd(), 'tests', 'fixtures', 'leveldb-sample');

describe('openReadOnly', () => {
  let workDir: string;
  let fixture: string;

  before(() => {
    workDir = mkdtempSync(join(tmpdir(), 'copilot-mcp-leveldb-'));
  });

  after(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  beforeEach((t) => {
    fixture = join(workDir, `run-${t.name.replace(/\s+/g, '_')}-${Date.now()}`);
    cpSync(FIXTURE_SRC, fixture, { recursive: true });
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  test('opens the fixture and iterates keys with a string prefix', async () => {
    const db = await openReadOnly(fixture);
    const keys: string[] = [];
    for await (const key of db.keysWithPrefix('remote_documents/transactions/')) {
      keys.push(Buffer.from(key).toString('utf8'));
    }
    await db.close();
    assert.deepStrictEqual(keys.sort(), [
      'remote_documents/transactions/txn-1',
      'remote_documents/transactions/txn-2',
    ]);
  });

  test('opens the fixture and iterates keys with a Uint8Array prefix', async () => {
    const db = await openReadOnly(fixture);
    const keys: Buffer[] = [];
    for await (const key of db.keysWithPrefix(Buffer.from('remote_documents/accounts/'))) {
      keys.push(Buffer.from(key));
    }
    await db.close();
    assert.strictEqual(keys.length, 1);
    assert.strictEqual(keys[0].toString('utf8'), 'remote_documents/accounts/acct-1');
  });

  test('stops iteration at the prefix boundary', async () => {
    const db = await openReadOnly(fixture);
    const keys: string[] = [];
    for await (const key of db.keysWithPrefix('remote_documents/categories/')) {
      keys.push(Buffer.from(key).toString('utf8'));
    }
    await db.close();
    // target_globals/ sorts after remote_documents/; the iterator must stop at
    // the prefix boundary rather than walking to the end of the database.
    assert.deepStrictEqual(keys, ['remote_documents/categories/cat-1']);
  });

  test('reads value bytes by string key', async () => {
    const db = await openReadOnly(fixture);
    const value = await db.get('remote_documents/accounts/acct-1');
    await db.close();
    assert.ok(value);
    assert.strictEqual(JSON.parse(Buffer.from(value).toString()).name, 'Checking');
  });

  test('reads value bytes by Uint8Array key', async () => {
    const db = await openReadOnly(fixture);
    const value = await db.get(Buffer.from('remote_documents/categories/cat-1'));
    await db.close();
    assert.ok(value);
    assert.strictEqual(JSON.parse(Buffer.from(value).toString()).name, 'Food');
  });

  test('get returns undefined for missing key', async () => {
    const db = await openReadOnly(fixture);
    const value = await db.get('no/such/key');
    await db.close();
    assert.strictEqual(value, undefined);
  });

  test('throws LOCAL_CACHE_MISSING when path does not exist', async () => {
    await assert.rejects(
      () => openReadOnly('/no/such/dir'),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });

  test('throws LOCAL_CACHE_LOCKED when lock is held by another handle', async () => {
    // Open twice: first normal, second should fail with a lock-related error.
    const first = await openReadOnly(fixture);
    try {
      await assert.rejects(
        () => openReadOnly(fixture),
        (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_LOCKED'
      );
    } finally {
      await first.close();
    }
  });
});
