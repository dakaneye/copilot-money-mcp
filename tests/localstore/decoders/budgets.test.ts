/**
 * Budget decoder tests.
 *
 * Uses synthetic `FirestoreDocument` objects rather than a committed
 * `budget.hex` fixture, mirroring the approach in `recurring.test.ts`. Field
 * names were verified against this user's real Firestore cache (Task 18 scan
 * of all 26 budget docs) and cross-checked with the reference MCP's
 * `processBudget` — the subset we surface (`category_id`, `amount`, `id`,
 * `amounts`) is the only subset actually persisted in this cache.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { decodeBudget } from '../../../src/localstore/decoders/budgets.js';
import type { FirestoreDocument } from '../../../src/localstore/protobuf.js';

const KEY = 'users/USER_1/budgets/BUDGET_1';

/**
 * Build a minimal valid budget doc and overlay caller-supplied fields.
 * The required set (`category_id`, `amount`) matches what every real doc in
 * the cache carries.
 */
function buildDoc(
  overrides: FirestoreDocument['fields'] = {}
): FirestoreDocument {
  return {
    fields: {
      category_id: { stringValue: 'CAT_1' },
      amount: { doubleValue: 150 },
      ...overrides,
    },
  };
}

describe('decodeBudget', () => {
  test('maps every Budget field from a fully-populated doc', () => {
    const doc = buildDoc({
      id: { stringValue: 'BUDGET_1' },
      amounts: {
        mapValue: {
          fields: {
            '2025-02': { doubleValue: 97 },
            '2025-03': { doubleValue: 60 },
            '2025-11': { doubleValue: 50 },
          },
        },
      },
    });

    const b = decodeBudget(KEY, doc);

    assert.strictEqual(b.id, 'BUDGET_1');
    assert.strictEqual(b.userId, 'USER_1');
    assert.strictEqual(b.categoryId, 'CAT_1');
    assert.strictEqual(b.defaultAmount, 150);
    assert.deepStrictEqual(b.monthlyOverrides, {
      '2025-02': 97,
      '2025-03': 60,
      '2025-11': 50,
    });
  });

  test('falls back to path segment when `id` field is absent', () => {
    // 5/26 docs in the real cache omit the `id` field; the path segment is
    // the structural truth and is always equal to `id` when both exist.
    const b = decodeBudget(KEY, buildDoc());
    assert.strictEqual(b.id, 'BUDGET_1');
  });

  test('prefers `id` field over path segment when present', () => {
    const doc = buildDoc({ id: { stringValue: 'BUDGET_FROM_FIELD' } });
    const b = decodeBudget(KEY, doc);
    assert.strictEqual(b.id, 'BUDGET_FROM_FIELD');
  });

  test('amount as integerValue decodes to a number (whole-dollar budgets)', () => {
    // 3/26 docs in the real cache use integerValue for whole-dollar amounts.
    const doc = buildDoc({ amount: { integerValue: '600' } });
    const b = decodeBudget(KEY, doc);
    assert.strictEqual(b.defaultAmount, 600);
  });

  test('amount of zero is preserved (tracked category with no cap)', () => {
    // 12/26 docs in the real cache carry amount: 0 — must pass, not throw.
    const doc = buildDoc({ amount: { doubleValue: 0 } });
    const b = decodeBudget(KEY, doc);
    assert.strictEqual(b.defaultAmount, 0);
  });

  test('absent `amounts` map produces null, not an empty object', () => {
    // 6/26 docs in the real cache omit the `amounts` field entirely.
    // `null` preserves "no map written" as distinct from "empty map written".
    const b = decodeBudget(KEY, buildDoc());
    assert.strictEqual(b.monthlyOverrides, null);
  });

  test('empty `amounts` map produces {} (distinct from absent)', () => {
    // 16/26 docs in the real cache carry an empty `amounts: {}` map — the
    // user edited the budget at least once but has no month overrides.
    const doc = buildDoc({
      amounts: { mapValue: { fields: {} } },
    });
    const b = decodeBudget(KEY, doc);
    assert.deepStrictEqual(b.monthlyOverrides, {});
  });

  test('`amounts` map with integerValue entries decodes to numbers', () => {
    const doc = buildDoc({
      amounts: {
        mapValue: {
          fields: {
            '2024-12': { integerValue: '200' },
            '2025-01': { doubleValue: 150.5 },
          },
        },
      },
    });
    const b = decodeBudget(KEY, doc);
    assert.deepStrictEqual(b.monthlyOverrides, {
      '2024-12': 200,
      '2025-01': 150.5,
    });
  });

  test('`amounts` map silently drops non-numeric entries', () => {
    // Defensive — not observed in the cache but mirrors reference MCP's
    // tolerance. A non-numeric entry shouldn't poison the whole field.
    const doc = buildDoc({
      amounts: {
        mapValue: {
          fields: {
            '2025-01': { doubleValue: 100 },
            '2025-02': { stringValue: 'corrupt' },
            '2025-03': { doubleValue: 50 },
          },
        },
      },
    });
    const b = decodeBudget(KEY, doc);
    assert.deepStrictEqual(b.monthlyOverrides, {
      '2025-01': 100,
      '2025-03': 50,
    });
  });

  test('throws CACHE_DECODE_ERROR when category_id is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        amount: { doubleValue: 150 },
      },
    };
    assert.throws(
      () => decodeBudget(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when amount is missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        category_id: { stringValue: 'CAT_1' },
      },
    };
    assert.throws(
      () => decodeBudget(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when amount is the wrong type', () => {
    const doc = buildDoc({ amount: { stringValue: '150' } });
    assert.throws(
      () => decodeBudget(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR on bad key shape', () => {
    assert.throws(
      () => decodeBudget('not-a-valid-path', buildDoc()),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR on wrong collection in key', () => {
    assert.throws(
      () => decodeBudget('users/U/categories/C', buildDoc()),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('accepts the documented key shape users/{uid}/budgets/{id}', () => {
    const b = decodeBudget('users/abc123/budgets/xyz789', buildDoc());
    assert.strictEqual(b.userId, 'abc123');
    assert.strictEqual(b.id, 'xyz789');
  });
});
