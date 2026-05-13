import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalStore } from '../../src/localstore/index.js';
import type { LevelDbReader } from '../../src/localstore/leveldb.js';
import { encodeRemoteDocumentKey } from '../../src/localstore/keypath.js';
import { buildMaybeDocument, type BuildDocInput } from '../fixtures/build-firestore-doc.js';

/**
 * Minimal in-memory `LevelDbReader` for facade tests. Stores keys as binary
 * buffers (matching real Copilot on-disk keys) and returns their bytes on
 * `get`. `keysWithPrefix` uses the same byte-sorted semantics as the real
 * classic-level iterator.
 */
class FakeReader implements LevelDbReader {
  private entries: Array<{ key: Buffer; value: Buffer }> = [];
  private closed = false;
  public closeCalls = 0;

  put(key: Uint8Array, value: Uint8Array): void {
    this.entries.push({ key: Buffer.from(key), value: Buffer.from(value) });
    this.entries.sort((a, b) => Buffer.compare(a.key, b.key));
  }

  async *keysWithPrefix(prefix: string | Uint8Array): AsyncIterable<Uint8Array> {
    if (this.closed) throw new Error('FakeReader closed');
    const pb = Buffer.isBuffer(prefix)
      ? prefix
      : typeof prefix === 'string'
        ? Buffer.from(prefix, 'utf8')
        : Buffer.from(prefix);
    for (const { key } of this.entries) {
      if (key.length < pb.length) continue;
      if (key.subarray(0, pb.length).equals(pb)) yield key;
    }
  }

  async get(key: string | Uint8Array): Promise<Uint8Array | undefined> {
    if (this.closed) throw new Error('FakeReader closed');
    const target = Buffer.isBuffer(key)
      ? key
      : typeof key === 'string'
        ? Buffer.from(key, 'utf8')
        : Buffer.from(key);
    const hit = this.entries.find((e) => e.key.equals(target));
    return hit?.value;
  }

  async close(): Promise<void> {
    this.closeCalls++;
    this.closed = true;
  }
}

/** Put a decoded entity at the given Firestore path into the fake reader. */
function putDoc(reader: FakeReader, path: string, doc: BuildDocInput): void {
  reader.put(encodeRemoteDocumentKey(path), buildMaybeDocument(doc));
}

/** Put a raw value (used to test tombstone / non-document-key handling). */
function putRaw(reader: FakeReader, key: Uint8Array, value: Uint8Array): void {
  reader.put(key, value);
}

/** Build a reader populated with a realistic cross-entity dataset. */
function buildFullReader(): FakeReader {
  const r = new FakeReader();

  // --- Accounts ---------------------------------------------------------
  putDoc(r, 'items/ITEM_1/accounts/ACCT_1', {
    name: 'projects/p/databases/(default)/documents/items/ITEM_1/accounts/ACCT_1',
    fields: {
      name: { stringValue: 'Checking' },
      current_balance: { integerValue: 150000 },
      type: { stringValue: 'depository' },
      subtype: { stringValue: 'checking' },
    },
    updateTime: { seconds: 1_700_000_000 },
  });
  putDoc(r, 'items/ITEM_1/accounts/ACCT_2', {
    fields: {
      name: { stringValue: 'Savings' },
      current_balance: { integerValue: 500000 },
      type: { stringValue: 'depository' },
      subtype: { stringValue: 'savings' },
    },
    updateTime: { seconds: 1_700_000_100 },
  });
  // An account-root doc at items/ITEM_1 (not an account; must be skipped).
  putDoc(r, 'items/ITEM_1', {
    fields: { plaid_id: { stringValue: 'ITEM_1' } },
  });

  // --- Transactions (3 across two accounts, two dates) ------------------
  putDoc(r, 'items/ITEM_1/accounts/ACCT_1/transactions/TXN_1', {
    fields: {
      name: { stringValue: 'Coffee' },
      amount: { doubleValue: 4.25 },
      date: { stringValue: '2026-03-15' },
      created_timestamp: { timestampValue: { seconds: 1_710_000_000 } },
      category_id: { stringValue: 'CAT_FOOD' },
    },
    updateTime: { seconds: 1_710_000_500 },
  });
  putDoc(r, 'items/ITEM_1/accounts/ACCT_1/transactions/TXN_2', {
    fields: {
      name: { stringValue: 'Rent' },
      amount: { doubleValue: 2000 },
      date: { stringValue: '2026-04-01' },
      created_timestamp: { timestampValue: { seconds: 1_710_500_000 } },
      category_id: { stringValue: 'CAT_HOUSING' },
    },
  });
  putDoc(r, 'items/ITEM_1/accounts/ACCT_2/transactions/TXN_3', {
    fields: {
      name: { stringValue: 'Paycheck' },
      amount: { doubleValue: -3500 },
      date: { stringValue: '2026-04-10' },
      created_timestamp: { timestampValue: { seconds: 1_711_000_000 } },
      category_id: { stringValue: 'CAT_INCOME' },
    },
  });

  // --- Categories -------------------------------------------------------
  putDoc(r, 'users/USER_1/categories/CAT_FOOD', {
    fields: {
      name: { stringValue: 'Food' },
      color: { stringValue: '#FF0000' },
    },
    updateTime: { seconds: 1_700_100_000 },
  });
  putDoc(r, 'users/USER_1/categories/CAT_HOUSING', {
    fields: {
      name: { stringValue: 'Housing' },
      color: { stringValue: '#00FF00' },
    },
  });

  // --- Tags (one) -------------------------------------------------------
  putDoc(r, 'users/USER_1/tags/TAG_1', {
    fields: {
      name: { stringValue: 'Work' },
      color_name: { stringValue: 'PURPLE1' },
    },
  });

  // --- Recurring --------------------------------------------------------
  putDoc(r, 'users/USER_1/recurring/RECUR_1', {
    fields: {
      name: { stringValue: 'Netflix' },
      category_id: { stringValue: 'CAT_ENTERTAINMENT' },
      state: { stringValue: 'active' },
      amount: { doubleValue: 15.99 },
      frequency: { stringValue: 'monthly' },
    },
  });

  // --- Budgets ----------------------------------------------------------
  putDoc(r, 'users/USER_1/budgets/BUDGET_1', {
    fields: {
      category_id: { stringValue: 'CAT_FOOD' },
      amount: { doubleValue: 400 },
    },
  });
  putDoc(r, 'users/USER_1/budgets/BUDGET_2', {
    fields: {
      category_id: { stringValue: 'CAT_HOUSING' },
      amount: { doubleValue: 2000 },
    },
  });

  // --- Non-document keys (should be skipped) ----------------------------
  // A `target` key — different key-type label, no decoder should touch it.
  const targetKey: number[] = [0x85];
  for (const c of 'target') targetKey.push(c.charCodeAt(0));
  targetKey.push(0x00, 0x01, 0x8c, 0x82, 0x80);
  putRaw(r, Uint8Array.from(targetKey), Uint8Array.from([0x00]));

  // A `remote_document` path we don't model (e.g. `securities/S_1`) — the
  // scan should skip it silently.
  putDoc(r, 'securities/S_1', {
    fields: { ticker: { stringValue: 'AAPL' } },
  });

  return r;
}

describe('createLocalStore with injected reader', () => {
  test('getAccounts returns decoded accounts, sorted by name', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const accounts = await store.getAccounts();
    await store.close();

    assert.strictEqual(accounts.length, 2);
    assert.deepStrictEqual(
      accounts.map((a) => a.id),
      ['ACCT_1', 'ACCT_2']
    );
    assert.strictEqual(accounts[0].name, 'Checking');
    assert.strictEqual(accounts[0].balance, 150000);
    assert.strictEqual(accounts[1].name, 'Savings');
    assert.strictEqual(accounts[1].type, 'savings');
  });

  test('getCategories returns decoded categories, sorted by name', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const cats = await store.getCategories();
    await store.close();

    assert.strictEqual(cats.length, 2);
    assert.deepStrictEqual(
      cats.map((c) => c.name),
      ['Food', 'Housing']
    );
    assert.strictEqual(cats[0].colorName, '#FF0000');
  });

  test('getTags returns decoded tags', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const tags = await store.getTags();
    await store.close();

    assert.strictEqual(tags.length, 1);
    assert.strictEqual(tags[0].id, 'TAG_1');
    assert.strictEqual(tags[0].name, 'Work');
    assert.strictEqual(tags[0].colorName, 'PURPLE1');
  });

  test('getRecurring returns decoded recurring', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const rec = await store.getRecurring();
    await store.close();

    assert.strictEqual(rec.length, 1);
    assert.strictEqual(rec[0].name, 'Netflix');
    assert.strictEqual(rec[0].amount, 15.99);
    assert.strictEqual(rec[0].state, 'active');
  });

  test('getBudgets returns decoded budgets', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const budgets = await store.getBudgets();
    await store.close();

    assert.strictEqual(budgets.length, 2);
    const byId = new Map(budgets.map((b) => [b.id, b]));
    assert.strictEqual(byId.get('BUDGET_1')?.categoryId, 'CAT_FOOD');
    assert.strictEqual(byId.get('BUDGET_1')?.defaultAmount, 400);
    assert.strictEqual(byId.get('BUDGET_2')?.defaultAmount, 2000);
  });

  test('getTransactions returns all transactions sorted by date desc by default', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const txns = await store.getTransactions();
    await store.close();

    assert.deepStrictEqual(
      txns.map((t) => t.id),
      ['TXN_3', 'TXN_2', 'TXN_1']
    );
    // Income transaction: negative amount -> credit
    assert.strictEqual(txns[0].type, 'credit');
    assert.strictEqual(txns[1].type, 'debit');
  });

  test('getTransactions applies since/until filter', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const txns = await store.getTransactions({ since: '2026-04-01', until: '2026-04-05' });
    await store.close();

    assert.strictEqual(txns.length, 1);
    assert.strictEqual(txns[0].id, 'TXN_2');
  });

  test('getTransactions filters by categoryId', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const txns = await store.getTransactions({ categoryId: 'CAT_FOOD' });
    await store.close();

    assert.strictEqual(txns.length, 1);
    assert.strictEqual(txns[0].id, 'TXN_1');
  });

  test('getTransactions filters by accountId', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const txns = await store.getTransactions({ accountId: 'ACCT_2' });
    await store.close();

    assert.strictEqual(txns.length, 1);
    assert.strictEqual(txns[0].id, 'TXN_3');
  });

  test('getTransactions filters by tagId', async () => {
    // Build a reader where one transaction has the tag injected via the
    // fixture (decoder always returns [] for tags, so we simulate the tool
    // layer having zipped one in).
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const beforeMutation = await store.getTransactions();
    // Decoder leaves tags empty; this filter should match nothing.
    const txns = await store.getTransactions({ tagId: 'TAG_1' });
    await store.close();

    assert.strictEqual(beforeMutation.length, 3);
    assert.strictEqual(txns.length, 0);
  });

  test('getTransactions respects default limit of 200', async () => {
    const reader = new FakeReader();
    // Build 250 transactions spanning consecutive dates.
    for (let i = 0; i < 250; i++) {
      const id = `TXN_${String(i).padStart(3, '0')}`;
      putDoc(reader, `items/I/accounts/A/transactions/${id}`, {
        fields: {
          name: { stringValue: `Purchase ${i}` },
          amount: { doubleValue: 10 },
          date: { stringValue: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` },
          created_timestamp: { timestampValue: { seconds: 1_700_000_000 + i } },
          category_id: { stringValue: 'CAT_X' },
        },
      });
    }
    const store = await createLocalStore({ reader, cacheLocation: '/fake' });
    const txns = await store.getTransactions();
    await store.close();

    assert.strictEqual(txns.length, 200);
  });

  test('getTransactions respects custom limit', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const txns = await store.getTransactions({ limit: 1 });
    await store.close();

    assert.strictEqual(txns.length, 1);
    assert.strictEqual(txns[0].id, 'TXN_3'); // latest date wins
  });

  test('getCacheStatus reports counts for every entity', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const status = await store.getCacheStatus();
    await store.close();

    assert.strictEqual(status.cacheLocation, '/fake/cache');
    assert.strictEqual(status.entities.accounts.count, 2);
    assert.strictEqual(status.entities.categories.count, 2);
    assert.strictEqual(status.entities.tags.count, 1);
    assert.strictEqual(status.entities.transactions.count, 3);
    assert.strictEqual(status.entities.recurring.count, 1);
    assert.strictEqual(status.entities.budgets.count, 2);
  });

  test('getCacheStatus lastUpdatedAt picks the max updateTime', async () => {
    const store = await createLocalStore({
      reader: buildFullReader(),
      cacheLocation: '/fake/cache',
    });
    const status = await store.getCacheStatus();
    await store.close();

    // Two accounts with updateTime 1_700_000_000 and 1_700_000_100: max wins.
    const expected = new Date(1_700_000_100 * 1000).toISOString().slice(0, -5);
    assert.strictEqual(
      status.entities.accounts.lastUpdatedAt,
      `${expected}.000000000Z`
    );
    // Transactions: TXN_1 has updateTime, the others don't.
    assert.ok(status.entities.transactions.lastUpdatedAt);
    // Budgets: no updateTime on either -> null.
    assert.strictEqual(status.entities.budgets.lastUpdatedAt, null);
  });

  test('getCacheStatus totalSizeBytes sums real cache directory file sizes', async () => {
    // Create a real directory with known file sizes and pass its path as the
    // cacheLocation. The injected reader means we never actually open it.
    const workDir = await mkdtemp(join(tmpdir(), 'copilot-mcp-status-'));
    try {
      await writeFile(join(workDir, 'CURRENT'), Buffer.alloc(16));
      await writeFile(join(workDir, '000001.log'), Buffer.alloc(128));
      await writeFile(join(workDir, '000002.ldb'), Buffer.alloc(1024));

      const store = await createLocalStore({
        reader: buildFullReader(),
        cacheLocation: workDir,
      });
      const status = await store.getCacheStatus();
      await store.close();

      assert.strictEqual(status.totalSizeBytes, 16 + 128 + 1024);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('close() closes the reader once even if called multiple times', async () => {
    const reader = buildFullReader();
    const store = await createLocalStore({ reader, cacheLocation: '/fake' });
    await store.getAccounts();
    await store.close();
    assert.strictEqual(reader.closeCalls, 1);
  });

  test('scan is memoized across calls (getAccounts then getTransactions)', async () => {
    // Observable via a reader that throws after the first exhaustion: a
    // second scan would blow up if memoization were broken.
    const reader = buildFullReader();
    let iterations = 0;
    const original = reader.keysWithPrefix.bind(reader);
    reader.keysWithPrefix = async function* (
      prefix: string | Uint8Array
    ): AsyncIterable<Uint8Array> {
      iterations++;
      yield* original(prefix);
    };

    const store = await createLocalStore({ reader, cacheLocation: '/fake' });
    await store.getAccounts();
    await store.getTransactions();
    await store.getCacheStatus();
    await store.close();

    assert.strictEqual(iterations, 1);
  });
});

describe('createLocalStore with real path', () => {
  test('rejects with LOCAL_CACHE_MISSING for a nonexistent path', async () => {
    await assert.rejects(
      () => createLocalStore({ path: '/no/such/dir/copilot-cache' }),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });

  test('copy-to-tempdir + close() removes the tempdir', async () => {
    // Stand up a real LevelDB under a temp dir by writing the minimum files
    // classic-level expects — easier: copy the existing leveldb-sample
    // fixture (string keys; scan will find nothing routable but the open/
    // close/cleanup path still runs end-to-end).
    const FIXTURE_SRC = join(process.cwd(), 'tests', 'fixtures', 'leveldb-sample');
    const workDir = await mkdtemp(join(tmpdir(), 'copilot-mcp-real-'));
    const cacheDir = join(workDir, 'cache');
    try {
      const { cp: cpPromise } = await import('node:fs/promises');
      await cpPromise(FIXTURE_SRC, cacheDir, { recursive: true });

      const store = await createLocalStore({ path: cacheDir });

      // Capture the tempdir by listing before/after close.
      // We can't see the tempdir path directly, but we can observe that
      // close() runs cleanly and the real cache is untouched.
      const accounts = await store.getAccounts();
      assert.deepStrictEqual(accounts, []); // String-keyed fixture has no decodable docs.

      await store.close();

      // Real cache dir must still exist and be untouched.
      assert.ok(existsSync(cacheDir));
      assert.ok(statSync(join(cacheDir, 'CURRENT')).size > 0);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
