import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { decodeAccount } from '../../../src/localstore/decoders/accounts.js';
import { decodeFirestoreDocument } from '../../../src/localstore/protobuf.js';
import type { FirestoreDocument } from '../../../src/localstore/protobuf.js';

// Compiled tests live under dist/, but fixtures live under tests/. Resolve
// from repo root (matches the pattern in tests/localstore/protobuf.test.ts).
const SAMPLES = join(process.cwd(), 'tests', 'fixtures', 'protobuf-samples');

describe('decodeAccount', () => {
  test('maps a decoded Firestore account doc to our Account type', () => {
    const hex = readFileSync(join(SAMPLES, 'account.hex'), 'utf8').trim();
    const doc = decodeFirestoreDocument(Buffer.from(hex, 'hex'));
    const key = 'items/ITEM_1/accounts/ACCT_1';
    const account = decodeAccount(key, doc);

    assert.strictEqual(account.id, 'ACCT_1');
    assert.strictEqual(account.itemId, 'ITEM_1');
    assert.strictEqual(account.name, 'Test Investment Account');
    // Firestore stores Plaid `type` (depository, investment, credit, loan) —
    // the decoder normalizes to our AccountType enum.
    assert.strictEqual(account.type, 'investment');
    assert.strictEqual(account.subType, '401k');
    // current_balance: 100000 cents
    assert.strictEqual(account.balance, 100000);
    // available_balance -> liveBalance
    assert.strictEqual(account.liveBalance, 0);
    // live_balance_backend_disabled=false -> hasLiveBalance=true
    assert.strictEqual(account.hasLiveBalance, true);
    // limit nullValue -> null
    assert.strictEqual(account.limit, null);
    assert.strictEqual(account.mask, '1234');
    assert.strictEqual(account.color, '#123456');
    assert.strictEqual(account.institutionId, 'ins_test');
    // is_manual is absent on this Plaid-linked account -> default false
    assert.strictEqual(account.isManual, false);
    // dashboard_active=false -> isUserHidden=true
    assert.strictEqual(account.isUserHidden, true);
    // user_deleted=false -> isUserClosed=false
    assert.strictEqual(account.isUserClosed, false);
    assert.strictEqual(
      account.latestBalanceUpdate,
      '2026-01-01T00:00:00.000000000Z'
    );
    // historical_update=true
    assert.strictEqual(account.hasHistoricalUpdates, true);
  });

  test('empty color maps to null', () => {
    const docWithEmptyColor: FirestoreDocument = {
      fields: {
        name: { stringValue: 'x' },
        current_balance: { integerValue: '0' },
        type: { stringValue: 'depository' },
        color: { stringValue: '' },
      },
    };
    const account = decodeAccount('items/I/accounts/A', docWithEmptyColor);
    assert.strictEqual(account.color, null);
  });

  test('depository + subtype=checking -> checking', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Checking' },
        current_balance: { integerValue: '1000' },
        type: { stringValue: 'depository' },
        subtype: { stringValue: 'checking' },
      },
    };
    const account = decodeAccount('items/I/accounts/A', doc);
    assert.strictEqual(account.type, 'checking');
    assert.strictEqual(account.subType, 'checking');
  });

  test('depository + subtype=savings -> savings', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Savings' },
        current_balance: { integerValue: '1000' },
        type: { stringValue: 'depository' },
        subtype: { stringValue: 'savings' },
      },
    };
    const account = decodeAccount('items/I/accounts/A', doc);
    assert.strictEqual(account.type, 'savings');
  });

  test('credit type -> credit', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Credit Card' },
        current_balance: { integerValue: '500' },
        type: { stringValue: 'credit' },
        limit: { integerValue: '100000' },
      },
    };
    const account = decodeAccount('items/I/accounts/A', doc);
    assert.strictEqual(account.type, 'credit');
    assert.strictEqual(account.limit, 100000);
  });

  test('unknown Plaid type -> other', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'Weird' },
        current_balance: { integerValue: '1' },
        type: { stringValue: 'something_new' },
      },
    };
    const account = decodeAccount('items/I/accounts/A', doc);
    assert.strictEqual(account.type, 'other');
  });

  test('throws CACHE_DECODE_ERROR if required fields missing', () => {
    assert.throws(
      () => decodeAccount('items/X/accounts/Y', { fields: {} } as FirestoreDocument),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR if key shape is wrong', () => {
    assert.throws(
      () =>
        decodeAccount('not-a-valid-path', {
          fields: {},
        } as FirestoreDocument),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });

  test('throws CACHE_DECODE_ERROR if balance is not a number', () => {
    const doc: FirestoreDocument = {
      fields: {
        name: { stringValue: 'x' },
        current_balance: { stringValue: 'NaN' },
        type: { stringValue: 'depository' },
      },
    };
    assert.throws(
      () => decodeAccount('items/I/accounts/A', doc),
      (err: Error) => (err as unknown as { code: string }).code === 'CACHE_DECODE_ERROR'
    );
  });
});
