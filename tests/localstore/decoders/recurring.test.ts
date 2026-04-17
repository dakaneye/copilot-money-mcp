/**
 * Recurring decoder tests.
 *
 * Uses synthetic `FirestoreDocument` objects rather than a committed
 * `recurring.hex` fixture, mirroring the approach in `transactions.test.ts`.
 * Field names were verified against this user's real Firestore cache (Task 17
 * scan of all 51 recurring documents) and cross-checked with the reference
 * MCP's `processRecurring` — both sources agree on the subset we surface.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { decodeRecurring } from '../../../src/localstore/decoders/recurring.js';
import type { FirestoreDocument } from '../../../src/localstore/protobuf.js';

const KEY = 'users/USER_1/recurring/REC_1';

/**
 * Build a minimal valid recurring doc and overlay caller-supplied fields.
 * The required set (name, category_id, state) matches what every real doc
 * in the cache carries.
 */
function buildDoc(
  overrides: FirestoreDocument['fields'] = {}
): FirestoreDocument {
  return {
    fields: {
      name: { stringValue: 'TurboTax' },
      category_id: { stringValue: 'CAT_1' },
      state: { stringValue: 'active' },
      ...overrides,
    },
  };
}

describe('decodeRecurring', () => {
  test('maps every Recurring field from a fully-populated doc', () => {
    const doc = buildDoc({
      id: { stringValue: 'REC_1' },
      amount: { doubleValue: 184.2 },
      emoji: { stringValue: '💰' },
      frequency: { stringValue: 'annually' },
      latest_date: { stringValue: '2025-02-16' },
      match_string: { stringValue: 'INTUIT 4INTUIT' },
    });

    const rec = decodeRecurring(KEY, doc);

    assert.strictEqual(rec.id, 'REC_1');
    assert.strictEqual(rec.userId, 'USER_1');
    assert.strictEqual(rec.name, 'TurboTax');
    assert.strictEqual(rec.amount, 184.2);
    assert.strictEqual(rec.emoji, '💰');
    assert.strictEqual(rec.frequency, 'annually');
    assert.strictEqual(rec.latestDate, '2025-02-16');
    assert.strictEqual(rec.categoryId, 'CAT_1');
    assert.strictEqual(rec.state, 'active');
    assert.strictEqual(rec.isActive, true);
    assert.strictEqual(rec.matchString, 'INTUIT 4INTUIT');
  });

  test('falls back to path segment when `id` field is absent', () => {
    // 7/51 docs in the real cache omit the `id` field; the path segment is
    // the structural truth.
    const rec = decodeRecurring(KEY, buildDoc());
    assert.strictEqual(rec.id, 'REC_1');
  });

  test('prefers `id` field over path segment when present', () => {
    const doc = buildDoc({ id: { stringValue: 'REC_FROM_FIELD' } });
    const rec = decodeRecurring(KEY, doc);
    assert.strictEqual(rec.id, 'REC_FROM_FIELD');
  });

  test('amount as integerValue decodes to a number (whole-dollar recurrings)', () => {
    // 8/51 docs in the real cache use integerValue for whole-dollar amounts.
    const doc = buildDoc({ amount: { integerValue: '100' } });
    const rec = decodeRecurring(KEY, doc);
    assert.strictEqual(rec.amount, 100);
  });

  test('negative amount preserved (expected-credit recurring like FSA reimbursement)', () => {
    // 2/51 docs in the real cache have negative amounts (income, not expense).
    const doc = buildDoc({ amount: { doubleValue: -312.5 } });
    const rec = decodeRecurring(KEY, doc);
    assert.strictEqual(rec.amount, -312.5);
  });

  test('missing optional fields produce null defaults', () => {
    // 10/51 docs omit amount, 9/51 omit frequency, 10/51 omit latest_date —
    // all three must decode to null, not throw.
    const rec = decodeRecurring(KEY, buildDoc());
    assert.strictEqual(rec.amount, null);
    assert.strictEqual(rec.emoji, null);
    assert.strictEqual(rec.frequency, null);
    assert.strictEqual(rec.latestDate, null);
    assert.strictEqual(rec.matchString, null);
  });

  test('paused state -> isActive: false', () => {
    const doc = buildDoc({ state: { stringValue: 'paused' } });
    const rec = decodeRecurring(KEY, doc);
    assert.strictEqual(rec.state, 'paused');
    assert.strictEqual(rec.isActive, false);
  });

  test('archived state -> isActive: false', () => {
    const doc = buildDoc({ state: { stringValue: 'archived' } });
    const rec = decodeRecurring(KEY, doc);
    assert.strictEqual(rec.state, 'archived');
    assert.strictEqual(rec.isActive, false);
  });

  test('throws CACHE_DECODE_ERROR on unknown state value', () => {
    const doc = buildDoc({ state: { stringValue: 'deleted' } });
    assert.throws(
      () => decodeRecurring(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when name is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        category_id: { stringValue: 'CAT_1' },
        state: { stringValue: 'active' },
      },
    };
    assert.throws(
      () => decodeRecurring(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when category_id is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'x' },
        state: { stringValue: 'active' },
      },
    };
    assert.throws(
      () => decodeRecurring(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when state is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'x' },
        category_id: { stringValue: 'CAT_1' },
      },
    };
    assert.throws(
      () => decodeRecurring(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR on bad key shape', () => {
    assert.throws(
      () => decodeRecurring('not-a-valid-path', buildDoc()),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR on wrong collection in key', () => {
    assert.throws(
      () => decodeRecurring('users/U/categories/C', buildDoc()),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('accepts the documented key shape users/{uid}/recurring/{id}', () => {
    const rec = decodeRecurring(
      'users/abc123/recurring/xyz789',
      buildDoc()
    );
    assert.strictEqual(rec.userId, 'abc123');
    assert.strictEqual(rec.id, 'xyz789');
  });

  test('accepts diverse real frequency strings (free-form)', () => {
    // The reference MCP's KNOWN_FREQUENCIES uses e.g. `biweekly` / `semiannually`
    // but this user's cache stores `bi-monthly` / `semi-annually`. Decoder
    // keeps frequency as an opaque string rather than validating an enum.
    for (const freq of [
      'monthly',
      'annually',
      'weekly',
      'quarterly',
      'semi-annually',
      'bi-monthly',
      'quad-monthly',
    ]) {
      const doc = buildDoc({ frequency: { stringValue: freq } });
      const rec = decodeRecurring(KEY, doc);
      assert.strictEqual(rec.frequency, freq);
    }
  });
});
