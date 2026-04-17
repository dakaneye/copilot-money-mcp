import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import {
  decodeKeyPath,
  encodeRemoteDocumentKey,
} from '../../src/localstore/keypath.js';

/**
 * Build a `remote_document` key the same way Copilot does. Expressed as a
 * hand-rolled concat here (rather than using `encodeRemoteDocumentKey`) so
 * the decoder test isn't just round-tripping its own encoder.
 */
function buildKey(segments: string[]): Uint8Array {
  const parts: number[] = [];
  parts.push(0x85);
  for (const c of 'remote_document') parts.push(c.charCodeAt(0));
  parts.push(0x00, 0x01);
  for (const seg of segments) {
    parts.push(0xbe);
    for (let i = 0; i < seg.length; i++) parts.push(seg.charCodeAt(i));
    parts.push(0x00, 0x01);
  }
  parts.push(0x80);
  return Uint8Array.from(parts);
}

describe('decodeKeyPath', () => {
  test('decodes a transaction path', () => {
    const key = buildKey([
      'items',
      'ITEM_1',
      'accounts',
      'ACCT_1',
      'transactions',
      'TXN_1',
    ]);
    assert.strictEqual(
      decodeKeyPath(key),
      'items/ITEM_1/accounts/ACCT_1/transactions/TXN_1'
    );
  });

  test('decodes an account path', () => {
    const key = buildKey(['items', 'ITEM_1', 'accounts', 'ACCT_1']);
    assert.strictEqual(decodeKeyPath(key), 'items/ITEM_1/accounts/ACCT_1');
  });

  test('decodes a category path', () => {
    const key = buildKey(['users', 'USER_1', 'categories', 'CAT_1']);
    assert.strictEqual(decodeKeyPath(key), 'users/USER_1/categories/CAT_1');
  });

  test('decodes a tag path', () => {
    const key = buildKey(['users', 'USER_1', 'tags', 'TAG_1']);
    assert.strictEqual(decodeKeyPath(key), 'users/USER_1/tags/TAG_1');
  });

  test('decodes a recurring path', () => {
    const key = buildKey(['users', 'USER_1', 'recurring', 'RECUR_1']);
    assert.strictEqual(decodeKeyPath(key), 'users/USER_1/recurring/RECUR_1');
  });

  test('decodes a budget path', () => {
    const key = buildKey(['users', 'USER_1', 'budgets', 'BUDGET_1']);
    assert.strictEqual(decodeKeyPath(key), 'users/USER_1/budgets/BUDGET_1');
  });

  test('decodes a single-segment root path', () => {
    const key = buildKey(['users', 'USER_1']);
    assert.strictEqual(decodeKeyPath(key), 'users/USER_1');
  });

  test('returns null for collection_parent keys', () => {
    // \x85 collection_parent \x00\x01 \x8e accounts \x00\x01 \xbe items \x00\x01 \x80
    // (synthesized from the research doc; we just need the label prefix to
    // mismatch `remote_document`.)
    const parts: number[] = [0x85];
    for (const c of 'collection_parent') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for target keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'target') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x8c, 0x82, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for target_global keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'target_global') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for target_document keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'target_document') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for document_target keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'document_target') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for query_target keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'query_target') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for remote_document_read_time keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'remote_document_read_time') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for version keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'version') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for mutation_queue keys', () => {
    const parts: number[] = [0x85];
    for (const c of 'mutation_queue') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for empty buffer', () => {
    assert.strictEqual(decodeKeyPath(new Uint8Array()), null);
  });

  test('returns null for truncated key (no terminator)', () => {
    const parts: number[] = [0x85];
    for (const c of 'remote_document') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0xbe);
    for (const c of 'items') parts.push(c.charCodeAt(0));
    // Missing \x00\x01 and \x80.
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null when first byte is not \\x85', () => {
    const parts: number[] = [0x84];
    for (const c of 'remote_document') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null when a segment marker is missing', () => {
    // Build a well-formed header but skip the \xbe before a segment.
    const parts: number[] = [0x85];
    for (const c of 'remote_document') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01);
    for (const c of 'items') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('returns null for remote_document key with no segments', () => {
    // Header followed directly by the terminator.
    const parts: number[] = [0x85];
    for (const c of 'remote_document') parts.push(c.charCodeAt(0));
    parts.push(0x00, 0x01, 0x80);
    assert.strictEqual(decodeKeyPath(Uint8Array.from(parts)), null);
  });

  test('accepts Buffer as well as Uint8Array', () => {
    const key = buildKey(['items', 'ITEM_1']);
    const asBuffer = Buffer.from(key);
    assert.strictEqual(decodeKeyPath(asBuffer), 'items/ITEM_1');
  });
});

describe('encodeRemoteDocumentKey', () => {
  test('round-trips through decodeKeyPath', () => {
    const path = 'items/ITEM_1/accounts/ACCT_1/transactions/TXN_1';
    const encoded = encodeRemoteDocumentKey(path);
    assert.strictEqual(decodeKeyPath(encoded), path);
  });

  test('starts with \\x85 remote_document \\x00\\x01', () => {
    const encoded = encodeRemoteDocumentKey('users/U/categories/C');
    assert.strictEqual(encoded[0], 0x85);
    const label = Buffer.from(encoded).subarray(1, 16).toString('utf8');
    assert.strictEqual(label, 'remote_document');
    assert.strictEqual(encoded[16], 0x00);
    assert.strictEqual(encoded[17], 0x01);
  });

  test('ends with \\x80', () => {
    const encoded = encodeRemoteDocumentKey('items/I');
    assert.strictEqual(encoded[encoded.length - 1], 0x80);
  });

  test('rejects non-ASCII segment bytes', () => {
    assert.throws(() => encodeRemoteDocumentKey('items/\u00ff'));
  });

  test('rejects empty path', () => {
    assert.throws(() => encodeRemoteDocumentKey(''));
  });
});
