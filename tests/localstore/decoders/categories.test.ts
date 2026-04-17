import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { decodeCategory } from '../../../src/localstore/decoders/categories.js';
import { decodeFirestoreDocument } from '../../../src/localstore/protobuf.js';
import type { FirestoreDocument } from '../../../src/localstore/protobuf.js';

// Compiled tests live under dist/, but fixtures live under tests/. Resolve
// from repo root (matches the pattern in tests/localstore/protobuf.test.ts).
const SAMPLES = join(process.cwd(), 'tests', 'fixtures', 'protobuf-samples');

describe('decodeCategory', () => {
  test('maps a decoded Firestore category doc to our Category type', () => {
    const hex = readFileSync(join(SAMPLES, 'category.hex'), 'utf8').trim();
    const doc = decodeFirestoreDocument(Buffer.from(hex, 'hex'));
    const key = 'users/USER_1/categories/CAT_1';
    const category = decodeCategory(key, doc);

    // id comes from the key path, not from the doc's `id` field.
    assert.strictEqual(category.id, 'CAT_1');
    assert.strictEqual(category.name, 'Fitness');
    // Firestore stores a hex color under `color` (e.g. "#EC5602"); we pass it
    // through to `colorName`.
    assert.strictEqual(category.colorName, '#EC5602');
    // emoji -> icon.unicode
    assert.deepStrictEqual(category.icon, { unicode: '🏃‍♂️' });
    // No template_id in Firestore -> null
    assert.strictEqual(category.templateId, null);
    // excluded=false
    assert.strictEqual(category.isExcluded, false);
    // No is_rollover_disabled in Firestore -> default false
    assert.strictEqual(category.isRolloverDisabled, false);
    // auto_delete_lock=true -> canBeDeleted=false (user cannot delete)
    assert.strictEqual(category.canBeDeleted, false);
    // Decoder leaves child resolution to the handler (Task 21).
    assert.deepStrictEqual(category.childCategories, []);
    // Aggregates (spend/budget) are not decoded from the category doc.
    assert.strictEqual(category.spend, undefined);
    assert.strictEqual(category.budget, undefined);
  });

  test('missing emoji -> icon is null', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'NoIcon' },
        color: { stringValue: '#000000' },
        excluded: { booleanValue: false },
      },
    };
    const category = decodeCategory('users/U/categories/C', doc);
    assert.strictEqual(category.icon, null);
  });

  test('empty emoji -> icon is null', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'EmptyIcon' },
        color: { stringValue: '#000000' },
        emoji: { stringValue: '' },
        excluded: { booleanValue: false },
      },
    };
    const category = decodeCategory('users/U/categories/C', doc);
    assert.strictEqual(category.icon, null);
  });

  test('auto_delete_lock=false -> canBeDeleted=true', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Deletable' },
        color: { stringValue: '#111111' },
        excluded: { booleanValue: false },
        auto_delete_lock: { booleanValue: false },
      },
    };
    const category = decodeCategory('users/U/categories/C', doc);
    assert.strictEqual(category.canBeDeleted, true);
  });

  test('auto_delete_lock absent -> canBeDeleted=true (permissive default)', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Deletable' },
        color: { stringValue: '#111111' },
        excluded: { booleanValue: false },
      },
    };
    const category = decodeCategory('users/U/categories/C', doc);
    assert.strictEqual(category.canBeDeleted, true);
  });

  test('excluded=true maps to isExcluded=true', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Hidden' },
        color: { stringValue: '#111111' },
        excluded: { booleanValue: true },
      },
    };
    const category = decodeCategory('users/U/categories/C', doc);
    assert.strictEqual(category.isExcluded, true);
  });

  test('throws CACHE_DECODE_ERROR if required fields missing', () => {
    assert.throws(
      () =>
        decodeCategory('users/U/categories/C', {
          fields: {},
        } as FirestoreDocument),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR if key shape is wrong', () => {
    assert.throws(
      () =>
        decodeCategory('not-a-valid-path', {
          fields: {},
        } as FirestoreDocument),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR if name is not a string', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { integerValue: '42' },
        color: { stringValue: '#111111' },
      },
    };
    assert.throws(
      () => decodeCategory('users/U/categories/C', doc),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });
});
