/**
 * Tag decoder tests.
 *
 * Field-name behavior verified against real tag documents: newer tags carry
 * `color_name` (palette token) and `hex_color` (hex string); older tags only
 * have `hex_color`. The decoder prefers `color_name`, falls back to
 * `hex_color`, and uses an empty string if neither is present.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { decodeTag } from '../../../src/localstore/decoders/tags.js';
import type { FirestoreDocument } from '../../../src/localstore/protobuf.js';

describe('decodeTag', () => {
  test('maps a synthetic Firestore tag doc to our Tag type', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'vacation' },
        color_name: { stringValue: 'PURPLE2' },
      },
    };
    const tag = decodeTag('users/USER_1/tags/TAG_1', doc);

    // id comes from the key path, not any `id` field in the doc.
    assert.strictEqual(tag.id, 'TAG_1');
    assert.strictEqual(tag.name, 'vacation');
    assert.strictEqual(tag.colorName, 'PURPLE2');
  });

  test('prefers color_name over hex_color when both present', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'business' },
        color_name: { stringValue: 'OLIVE1' },
        hex_color: { stringValue: '#EC5602' },
      },
    };
    const tag = decodeTag('users/U/tags/T', doc);
    assert.strictEqual(tag.colorName, 'OLIVE1');
  });

  test('falls back to hex_color when color_name is absent (older tags)', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Panama2024' },
        hex_color: { stringValue: '#F1D730FF' },
      },
    };
    const tag = decodeTag('users/U/tags/T', doc);
    assert.strictEqual(tag.colorName, '#F1D730FF');
  });

  test('returns empty colorName when both color_name and hex_color absent', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'orphan' },
      },
    };
    const tag = decodeTag('users/U/tags/T', doc);
    assert.strictEqual(tag.colorName, '');
  });

  test('throws CACHE_DECODE_ERROR if name is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        color_name: { stringValue: 'PURPLE2' },
      },
    };
    assert.throws(
      () => decodeTag('users/U/tags/T', doc),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR if name is not a string', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { integerValue: '42' },
        color_name: { stringValue: 'PURPLE2' },
      },
    };
    assert.throws(
      () => decodeTag('users/U/tags/T', doc),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR on bad key shape', () => {
    assert.throws(
      () =>
        decodeTag('not-a-valid-path', {
          fields: {
            name: { stringValue: 'x' },
            color_name: { stringValue: 'y' },
          },
        } as FirestoreDocument),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('accepts the documented key shape users/{uid}/tags/{tag_id}', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'x' },
        color_name: { stringValue: 'RED1' },
      },
    };
    // Should not throw.
    const tag = decodeTag('users/abc123/tags/xyz789', doc);
    assert.strictEqual(tag.id, 'xyz789');
  });
});
