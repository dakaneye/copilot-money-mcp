/**
 * Transaction decoder tests.
 *
 * Uses synthetic `FirestoreDocument` objects rather than a committed
 * `transaction.hex` fixture. Field names were verified against this user's
 * real Firestore cache (scan of all 289 transaction documents in the Task 16
 * extractor) and cross-checked with the reference MCP's `processTransaction`
 * — both sources agree. The tag decoder takes the same synthetic approach
 * (see tests/localstore/decoders/tags.test.ts).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  decodeTransaction,
  decodeTransactionReferences,
} from '../../../src/localstore/decoders/transactions.js';
import type { FirestoreDocument } from '../../../src/localstore/protobuf.js';

const KEY = 'items/ITEM_1/accounts/ACCT_1/transactions/TXN_1';

/**
 * Build a minimal valid transaction doc and overlay caller-supplied fields.
 * Keeps per-test noise down while still letting each case override whatever
 * it's testing.
 */
function buildDoc(
  overrides: FirestoreDocument['fields'] = {}
): FirestoreDocument {
  return {
    fields: {
      name: { stringValue: 'Test Merchant' },
      amount: { doubleValue: 12.34 },
      date: { stringValue: '2026-04-01' },
      created_timestamp: { timestampValue: '2026-04-01T12:34:56.000000000Z' },
      category_id: { stringValue: 'CAT_1' },
      user_reviewed: { booleanValue: true },
      pending: { booleanValue: false },
      ...overrides,
    },
  };
}

describe('decodeTransaction', () => {
  test('maps every Transaction field from a fully-populated doc', () => {
    const doc = buildDoc({
      recurring_id: { stringValue: 'REC_1' },
      user_note: { stringValue: 'office lunch' },
      intelligence_suggested_category_ids: {
        arrayValue: {
          values: [{ stringValue: 'CAT_A' }, { stringValue: 'CAT_B' }],
        },
      },
      // tag_ids / goal_id are reference-only and don't feed Transaction here
      tag_ids: { arrayValue: { values: [{ stringValue: 'TAG_1' }] } },
      goal_id: { stringValue: 'GOAL_1' },
    });

    const txn = decodeTransaction(KEY, doc);

    assert.strictEqual(txn.id, 'TXN_1');
    assert.strictEqual(txn.itemId, 'ITEM_1');
    assert.strictEqual(txn.accountId, 'ACCT_1');
    assert.strictEqual(txn.name, 'Test Merchant');
    assert.strictEqual(txn.amount, 12.34);
    assert.strictEqual(txn.date, '2026-04-01');
    // positive amount -> debit (expense)
    assert.strictEqual(txn.type, 'debit');
    assert.strictEqual(txn.categoryId, 'CAT_1');
    assert.strictEqual(txn.isReviewed, true);
    assert.strictEqual(txn.isPending, false);
    assert.strictEqual(txn.recurringId, 'REC_1');
    assert.deepStrictEqual(txn.suggestedCategoryIds, ['CAT_A', 'CAT_B']);
    assert.strictEqual(txn.userNotes, 'office lunch');
    assert.strictEqual(txn.tipAmount, null);
    assert.strictEqual(txn.createdAt, '2026-04-01T12:34:56.000000000Z');
    // Tags and goal are always deferred to the tool handler
    assert.deepStrictEqual(txn.tags, []);
    assert.strictEqual(txn.goal, null);
  });

  test('negative amount maps to type=credit (income/refund)', () => {
    const doc = buildDoc({ amount: { doubleValue: -250 } });
    const txn = decodeTransaction(KEY, doc);
    assert.strictEqual(txn.amount, -250);
    assert.strictEqual(txn.type, 'credit');
  });

  test('zero amount maps to type=debit (default)', () => {
    const doc = buildDoc({ amount: { integerValue: '0' } });
    const txn = decodeTransaction(KEY, doc);
    assert.strictEqual(txn.amount, 0);
    assert.strictEqual(txn.type, 'debit');
  });

  test('integerValue amount works (whole-dollar transactions use int encoding)', () => {
    // Copilot serializes whole-dollar amounts as integerValue (~22% of real
    // docs in this cache); doubleValue otherwise. Both must decode to number.
    const doc = buildDoc({ amount: { integerValue: '100' } });
    const txn = decodeTransaction(KEY, doc);
    assert.strictEqual(txn.amount, 100);
    assert.strictEqual(txn.type, 'debit');
  });

  test('empty category_id maps to null (uncategorized)', () => {
    const doc = buildDoc({ category_id: { stringValue: '' } });
    const txn = decodeTransaction(KEY, doc);
    assert.strictEqual(txn.categoryId, null);
  });

  test('missing optional fields produce sensible defaults', () => {
    const minimal: FirestoreDocument = {
      fields: {
        name: { stringValue: 'x' },
        amount: { doubleValue: 1 },
        date: { stringValue: '2026-04-01' },
        created_timestamp: {
          timestampValue: '2026-04-01T00:00:00.000000000Z',
        },
      },
    };
    const txn = decodeTransaction(KEY, minimal);
    assert.strictEqual(txn.categoryId, null);
    assert.strictEqual(txn.isReviewed, false);
    assert.strictEqual(txn.isPending, false);
    assert.strictEqual(txn.recurringId, null);
    assert.deepStrictEqual(txn.suggestedCategoryIds, []);
    assert.strictEqual(txn.userNotes, null);
    assert.strictEqual(txn.tipAmount, null);
    assert.deepStrictEqual(txn.tags, []);
    assert.strictEqual(txn.goal, null);
  });

  test('throws CACHE_DECODE_ERROR when required field missing', () => {
    const doc: FirestoreDocument = {
      fields: {
        // `amount`, `date`, `created_timestamp` all missing
        name: { stringValue: 'x' },
      },
    };
    assert.throws(
      () => decodeTransaction(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when amount is not a number', () => {
    const doc = buildDoc({ amount: { stringValue: 'NaN' } });
    assert.throws(
      () => decodeTransaction(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR when created_timestamp is not a timestamp', () => {
    const doc = buildDoc({
      created_timestamp: { stringValue: '2026-04-01' },
    });
    assert.throws(
      () => decodeTransaction(KEY, doc),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR on bad key shape', () => {
    assert.throws(
      () => decodeTransaction('not-a-valid-path', buildDoc()),
      (err: Error) =>
        (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('accepts the documented key shape items/{item}/accounts/{acct}/transactions/{txn}', () => {
    const txn = decodeTransaction(
      'items/abc/accounts/def/transactions/xyz',
      buildDoc()
    );
    assert.strictEqual(txn.itemId, 'abc');
    assert.strictEqual(txn.accountId, 'def');
    assert.strictEqual(txn.id, 'xyz');
  });
});

describe('decodeTransactionReferences', () => {
  test('returns tag_ids and goal_id when present', () => {
    const doc: FirestoreDocument = {
      fields: {
        tag_ids: {
          arrayValue: {
            values: [{ stringValue: 'TAG_A' }, { stringValue: 'TAG_B' }],
          },
        },
        goal_id: { stringValue: 'GOAL_1' },
      },
    };
    const refs = decodeTransactionReferences(doc);
    assert.deepStrictEqual(refs.tagIds, ['TAG_A', 'TAG_B']);
    assert.strictEqual(refs.goalId, 'GOAL_1');
  });

  test('returns empty tagIds and null goalId when absent', () => {
    const refs = decodeTransactionReferences({ fields: {} });
    assert.deepStrictEqual(refs.tagIds, []);
    assert.strictEqual(refs.goalId, null);
  });

  test('drops non-string tag_ids entries defensively', () => {
    const doc: FirestoreDocument = {
      fields: {
        tag_ids: {
          arrayValue: {
            values: [
              { stringValue: 'TAG_A' },
              { integerValue: '42' },
              { stringValue: 'TAG_B' },
            ],
          },
        },
      },
    };
    const refs = decodeTransactionReferences(doc);
    assert.deepStrictEqual(refs.tagIds, ['TAG_A', 'TAG_B']);
  });
});
