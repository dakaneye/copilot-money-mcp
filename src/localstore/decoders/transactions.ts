/**
 * Firestore -> Transaction decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path
 * (`items/{item_id}/accounts/{account_id}/transactions/{txn_id}`) and produces
 * our `Transaction` shape. Field names come from inspecting the real cache
 * (289 transactions in this user's DB; see the Task 16 scan), cross-checked
 * against the reference MCP's `processTransaction`
 * (ignaciohermosillacornejo/copilot-money-mcp, src/core/decoder.ts).
 *
 *   Firestore field                        -> Transaction property
 *   ------------------------------------      -----------------------------
 *   (from key path)                        -> id, itemId, accountId
 *   name                                   -> name
 *   amount (double OR integer, signed,     -> amount
 *     dollars — positive = debit/expense,     +
 *     negative = credit/income)             -> type (derived from sign)
 *   date (YYYY-MM-DD stringValue)          -> date
 *   category_id (empty string -> null)     -> categoryId
 *   user_reviewed                          -> isReviewed
 *   pending                                -> isPending
 *   recurring_id                           -> recurringId
 *   intelligence_suggested_category_ids    -> suggestedCategoryIds
 *   user_note                              -> userNotes
 *   (no tip_amount observed; reference     -> tipAmount (always null — Copilot
 *    MCP does not surface one either)         exposes `tipAmount` on the
 *                                             GraphQL type but we have no
 *                                             Firestore field to source it
 *                                             from)
 *   created_timestamp                      -> createdAt (ISO 8601)
 *   tag_ids -> (deferred)                  -> tags: [] (resolved in Task 23)
 *   goal_id -> (deferred)                  -> goal: null (resolved in Task 23)
 *
 * Nested references (tags, goal) cannot be resolved in the decoder because
 * Tag and Goal objects live in separate collections. `decodeTransaction`
 * always returns `tags: []` and `goal: null`; callers that need them should
 * also call `decodeTransactionReferences(doc)` to get the raw IDs and zip in
 * resolved objects from `LocalStore.getTags()` / `LocalStore.getGoals()`.
 *
 * Amount sign convention (inherited from Copilot's on-disk format):
 * - `amount >= 0` is an expense -> `type: 'debit'`
 * - `amount <  0` is income/refund -> `type: 'credit'`
 *
 * Observed but unmapped Firestore fields (intentionally not surfaced):
 *   - account_dashboard_active, account_id, account_type, is_amazon,
 *     is_manual, iso_currency_code, original_amount, original_clean_name,
 *     original_date, original_name, original_transaction_id,
 *     parent_transaction_id, children_transaction_ids,
 *     pending_transaction_id, plaid_category_id, plaid_category_strings,
 *     plaid_deleted, plaid_pending_transaction_id, plaid_transaction_type,
 *     recurring (boolean, distinct from recurring_id), skip_balance_adjust,
 *     user_deleted, user_id, user_changed_type, _origin, category_id_source,
 *     intelligence_category_scores, intelligence_chosen_category_id,
 *     intelligence_powered, old_category_id, name_override,
 *     finance_kit_extra_data, internal_tx_match, location, payment_meta,
 *     venmo_extra_data, type (Firestore's `type` holds values like
 *     "internal_transfer" and is unrelated to our debit/credit enum —
 *     the TS `type` is derived from the sign of `amount`).
 */

import type { Transaction } from '../../types/transaction.js';
import { CopilotMoneyError } from '../../types/error.js';
import type { FirestoreDocument, FirestoreValueShape } from '../protobuf.js';
import { FirestoreValue } from '../protobuf.js';
import {
  isNumber,
  isString,
  optionalBoolean,
  optionalString,
  requireString,
} from './_helpers.js';

const KEY_PATTERN =
  /^items\/([^/]+)\/accounts\/([^/]+)\/transactions\/([^/]+)$/;
const ENTITY_KIND = 'Transaction';

function parseKey(key: string): {
  itemId: string;
  accountId: string;
  transactionId: string;
} {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Bad transaction key: ${key}`
    );
  }
  return { itemId: match[1], accountId: match[2], transactionId: match[3] };
}

/**
 * Amount may be stored as `integerValue` (whole-dollar amounts) or
 * `doubleValue` (everything else). `FirestoreValue.toJs` normalizes both to
 * JS `number`, so we just need a numeric guard.
 */
function requireAmount(
  fields: Record<string, FirestoreValueShape>,
  entityId: string
): number {
  const raw = fields['amount'];
  if (!raw) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${ENTITY_KIND} ${entityId} missing required field: amount`
    );
  }
  const js = FirestoreValue.toJs(raw);
  if (!isNumber(js)) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${ENTITY_KIND} ${entityId} field amount is not a number`
    );
  }
  return js;
}

/**
 * `created_timestamp` is stored as a Firestore Timestamp which the protobuf
 * decoder surfaces as an ISO 8601 `timestampValue` string.
 */
function requireTimestampString(
  fields: Record<string, FirestoreValueShape>,
  name: string,
  entityId: string
): string {
  const raw = fields[name];
  if (!raw) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${ENTITY_KIND} ${entityId} missing required field: ${name}`
    );
  }
  if (!('timestampValue' in raw)) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${ENTITY_KIND} ${entityId} field ${name} is not a timestamp`
    );
  }
  return raw.timestampValue;
}

/** Read a string[] from an `arrayValue`, silently dropping non-string entries. */
function optionalStringArray(
  fields: Record<string, FirestoreValueShape>,
  name: string
): string[] {
  const raw = fields[name];
  if (!raw || !('arrayValue' in raw)) return [];
  const out: string[] = [];
  for (const item of raw.arrayValue.values) {
    const js = FirestoreValue.toJs(item);
    if (isString(js)) out.push(js);
  }
  return out;
}

/**
 * Decode a Firestore transaction document into our `Transaction` shape.
 *
 * `tags` and `goal` are returned as `[]` / `null` — raw IDs are available via
 * `decodeTransactionReferences` and are resolved by the tool handler against
 * the full Tag/Goal collections.
 */
export function decodeTransaction(
  key: string,
  doc: FirestoreDocument
): Transaction {
  const { itemId, accountId, transactionId } = parseKey(key);
  const f = doc.fields;

  const name = requireString(f, 'name', ENTITY_KIND, transactionId);
  const amount = requireAmount(f, transactionId);
  const date = requireString(f, 'date', ENTITY_KIND, transactionId);
  const createdAt = requireTimestampString(f, 'created_timestamp', transactionId);

  // category_id is always present in this cache but may be an empty string
  // for uncategorized transactions; surface that as null.
  const rawCategoryId = optionalString(f, 'category_id');
  const categoryId =
    rawCategoryId && rawCategoryId.length > 0 ? rawCategoryId : null;

  return {
    id: transactionId,
    itemId,
    accountId,
    name,
    amount,
    date,
    // Copilot's sign convention: positive = money out (debit/expense),
    // negative = money in (credit/income). Exact zero treated as debit.
    type: amount < 0 ? 'credit' : 'debit',
    categoryId,
    isReviewed: optionalBoolean(f, 'user_reviewed') ?? false,
    isPending: optionalBoolean(f, 'pending') ?? false,
    recurringId: optionalString(f, 'recurring_id'),
    suggestedCategoryIds: optionalStringArray(
      f,
      'intelligence_suggested_category_ids'
    ),
    userNotes: optionalString(f, 'user_note'),
    // No `tip_amount` field observed in any of the 289 cached transactions,
    // and the reference MCP does not surface one either. Always null.
    tipAmount: null,
    createdAt,
    tags: [],
    goal: null,
  };
}

/**
 * Surface the raw reference IDs (`tag_ids`, `goal_id`) so the tool handler
 * can resolve them against the Tag / Goal collections and zip the resulting
 * objects into the Transaction. Kept separate from `decodeTransaction` to
 * keep the Transaction type free of leaky `_*` fields.
 */
export function decodeTransactionReferences(doc: FirestoreDocument): {
  tagIds: string[];
  goalId: string | null;
} {
  return {
    tagIds: optionalStringArray(doc.fields, 'tag_ids'),
    goalId: optionalString(doc.fields, 'goal_id'),
  };
}
