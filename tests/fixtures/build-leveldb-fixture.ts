// Fixture generator for the LevelDB reader tests.
//
// Run with:
//   node --experimental-strip-types tests/fixtures/build-leveldb-fixture.ts
// (Node 22.6+; strip-types is unflagged on 23.6+.)
//
// Produces a small LevelDB database under tests/fixtures/leveldb-sample/ with
// a handful of deterministic Buffer-keyed entries that exercise the
// prefix-iteration and get-by-key paths in src/localstore/leveldb.ts.
//
// Real Copilot Money keys are binary (see
// docs/research/2026-04-17-firestore-leveldb-format.md), but string keys are
// sufficient for these unit-level fixtures. Protobuf decoding is tested
// separately against recorded binary samples.
import { ClassicLevel } from 'classic-level';
import { rmSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

const DIR = join(import.meta.dirname, 'leveldb-sample');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const db = new ClassicLevel<Buffer, Buffer>(DIR, {
  keyEncoding: 'buffer',
  valueEncoding: 'buffer',
});
await db.open();

const put = (key: string, value: Buffer): Promise<void> =>
  db.put(Buffer.from(key, 'utf8'), value);

await put(
  'remote_documents/transactions/txn-1',
  Buffer.from(JSON.stringify({ amount: 100 }))
);
await put(
  'remote_documents/transactions/txn-2',
  Buffer.from(JSON.stringify({ amount: 200 }))
);
await put(
  'remote_documents/accounts/acct-1',
  Buffer.from(JSON.stringify({ name: 'Checking' }))
);
await put(
  'remote_documents/categories/cat-1',
  Buffer.from(JSON.stringify({ name: 'Food' }))
);
await put('target_globals/x', Buffer.alloc(0));

await db.close();

// Remove the LevelDB debug log (contains wall-clock timestamps) so the
// committed fixture directory is byte-stable across regenerations.
const logFile = join(DIR, 'LOG');
if (existsSync(logFile)) unlinkSync(logFile);

console.log('fixture written to', DIR);
