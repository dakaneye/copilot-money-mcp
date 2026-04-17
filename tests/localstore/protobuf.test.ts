import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import {
  decodeFirestoreDocument,
  FirestoreValue,
  type FirestoreValueShape,
} from '../../src/localstore/protobuf.js';

// Resolve the committed fixture from the repo root (same approach as
// tests/localstore/leveldb.test.ts). The compiled tests live under dist/
// whereas the fixture lives under tests/fixtures/, so we can't use
// import.meta.dirname.
const SAMPLES = join(process.cwd(), 'tests', 'fixtures', 'protobuf-samples');

describe('decodeFirestoreDocument', () => {
  test('decodes a redacted category sample into a fields map', () => {
    const hex = readFileSync(join(SAMPLES, 'category.hex'), 'utf8').trim();
    const bytes = Buffer.from(hex, 'hex');
    const doc = decodeFirestoreDocument(bytes);

    assert.ok(doc.fields, 'fields map must exist');
    assert.strictEqual(typeof doc.fields, 'object');

    // The redacted fixture is a Firestore category with a known shape.
    // name (stringValue)
    const nameField = doc.fields.name;
    assert.ok(nameField && 'stringValue' in nameField, 'name must be a stringValue');
    assert.strictEqual(nameField.stringValue, 'Fitness');

    // id (stringValue)
    const idField = doc.fields.id;
    assert.ok(idField && 'stringValue' in idField, 'id must be a stringValue');
    assert.strictEqual(idField.stringValue, '7nEaFt59mXn7rtZC18qT');

    // booleans
    const excluded = doc.fields.excluded;
    assert.ok(excluded && 'booleanValue' in excluded);
    assert.strictEqual(excluded.booleanValue, false);

    const autoBudgetLock = doc.fields.auto_budget_lock;
    assert.ok(autoBudgetLock && 'booleanValue' in autoBudgetLock);
    assert.strictEqual(autoBudgetLock.booleanValue, true);

    // integer
    const order = doc.fields.order;
    assert.ok(order && 'integerValue' in order);
    assert.strictEqual(order.integerValue, '9');

    // empty array
    const plaidIds = doc.fields.plaid_category_ids;
    assert.ok(plaidIds && 'arrayValue' in plaidIds);
    assert.deepStrictEqual(plaidIds.arrayValue.values, []);
  });

  test('decoded document exposes the document path via name', () => {
    const hex = readFileSync(join(SAMPLES, 'category.hex'), 'utf8').trim();
    const bytes = Buffer.from(hex, 'hex');
    const doc = decodeFirestoreDocument(bytes);

    assert.ok(doc.name, 'document name/path should be present');
    assert.match(doc.name!, /categories\/7nEaFt59mXn7rtZC18qT$/);
    // Redacted sample must not leak the real UID.
    assert.doesNotMatch(doc.name!, /7RQytMiUCmUEB1yHKqOZBqrGvD43/);
  });

  test('throws CACHE_DECODE_ERROR on malformed bytes', () => {
    assert.throws(
      () => decodeFirestoreDocument(Buffer.from([0xff, 0xff, 0xff])),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when the MaybeDocument has no Document field', () => {
    // A MaybeDocument containing only field 1 (NoDocument) — should be rejected
    // so callers know to filter these upstream.
    const noDocOnly = Buffer.from([0x0a, 0x02, 0x08, 0x00]);
    assert.throws(
      () => decodeFirestoreDocument(noDocOnly),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('FirestoreValue.toJs converts stringValue to string', () => {
    assert.strictEqual(FirestoreValue.toJs({ stringValue: 'hello' }), 'hello');
  });

  test('FirestoreValue.toJs converts integerValue to number', () => {
    assert.strictEqual(FirestoreValue.toJs({ integerValue: '42' }), 42);
  });

  test('FirestoreValue.toJs converts timestampValue to ISO string', () => {
    const iso = FirestoreValue.toJs({ timestampValue: '2026-04-17T00:00:00Z' });
    assert.strictEqual(iso, '2026-04-17T00:00:00Z');
  });

  test('FirestoreValue.toJs handles nullValue', () => {
    assert.strictEqual(FirestoreValue.toJs({ nullValue: null }), null);
  });

  test('FirestoreValue.toJs handles booleanValue', () => {
    assert.strictEqual(FirestoreValue.toJs({ booleanValue: true }), true);
  });

  test('FirestoreValue.toJs handles doubleValue', () => {
    assert.strictEqual(FirestoreValue.toJs({ doubleValue: 3.14 }), 3.14);
  });

  test('FirestoreValue.toJs handles referenceValue', () => {
    const shape: FirestoreValueShape = {
      referenceValue: 'projects/p/databases/(default)/documents/foo/bar',
    };
    assert.strictEqual(FirestoreValue.toJs(shape), 'projects/p/databases/(default)/documents/foo/bar');
  });

  test('FirestoreValue.toJs handles bytesValue', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    assert.strictEqual(FirestoreValue.toJs({ bytesValue: bytes }), bytes);
  });

  test('FirestoreValue.toJs handles geoPointValue', () => {
    const shape: FirestoreValueShape = {
      geoPointValue: { latitude: 40.7, longitude: -74.0 },
    };
    assert.deepStrictEqual(FirestoreValue.toJs(shape), { latitude: 40.7, longitude: -74.0 });
  });

  test('FirestoreValue.toJs handles arrayValue', () => {
    const result = FirestoreValue.toJs({
      arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '1' }] },
    });
    assert.deepStrictEqual(result, ['a', 1]);
  });

  test('FirestoreValue.toJs handles mapValue', () => {
    const result = FirestoreValue.toJs({
      mapValue: { fields: { x: { stringValue: 'v' } } },
    });
    assert.deepStrictEqual(result, { x: 'v' });
  });
});
