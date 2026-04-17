/**
 * Tag decoder tests.
 *
 * UNVERIFIED FIELD NAMES: this user's Firestore cache has no tag documents,
 * so there is no committed `tag.hex` fixture. All inputs here are synthetic
 * `FirestoreDocument` objects constructed to match the field names the
 * reference MCP observes in real caches (`name`, `color_name`). When the
 * first real tag document appears, spot-check the decoder's mapping against
 * it and keep or revise these tests accordingly.
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

  test('ignores extra Firestore fields (e.g. hex_color)', () => {
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

  test('throws CACHE_DECODE_ERROR if color_name is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'vacation' },
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
