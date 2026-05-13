/**
 * Firestore -> Recurring decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path (`users/{user_id}/recurring/{recurring_id}`) and
 * produces our `Recurring` shape.
 *
 * Field-name mapping verified empirically against all 51 recurring documents
 * in this user's Firestore cache (Task 17 scan) and cross-checked against the
 * reference MCP's `processRecurring`:
 *
 *   ignaciohermosillacornejo/copilot-money-mcp
 *   src/core/decoder.ts
 *   MIT License, https://github.com/ignaciohermosillacornejo/copilot-money-mcp/blob/main/LICENSE
 *
 * The reference MCP's shape is broader (surfaces min_amount, max_amount,
 * transaction_ids, etc.); we intentionally narrow to the minimal set the
 * `get_recurring` tool exposes today (see `src/types/recurring.ts` for the
 * rationale). Three divergences from the reference MCP worth calling out:
 *
 *   - `days_filter` is an `arrayValue` in this cache, not a number — the
 *     reference MCP's `getNumber(fields, 'days_filter')` would silently miss
 *     it. We drop the field entirely rather than paper over the mismatch.
 *   - `state` is the authoritative status field; the reference MCP reads an
 *     `is_active` boolean as fallback, but no recurring doc in this cache
 *     stores `is_active`, so we treat `state` as required.
 *   - `next_date` is not persisted in Firestore; the reference MCP *computes*
 *     it from `latest_date + frequency`. We keep that as a presentation
 *     concern and surface `latestDate` (the raw field) instead.
 */

import type { Recurring, RecurringState } from '../../types/recurring.js';
import { CopilotMoneyError } from '../../types/error.js';
import type { FirestoreDocument } from '../protobuf.js';
import {
  optionalNumber,
  optionalString,
  requireString,
} from './_helpers.js';

const KEY_PATTERN = /^users\/([^/]+)\/recurring\/([^/]+)$/;
const ENTITY_KIND = 'Recurring';
const VALID_STATES: readonly RecurringState[] = ['active', 'paused', 'archived'];

function parseKey(key: string): { userId: string; recurringId: string } {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Bad recurring key: ${key}`
    );
  }
  return { userId: match[1], recurringId: match[2] };
}

function toState(raw: string, entityId: string): RecurringState {
  if (VALID_STATES.includes(raw as RecurringState)) {
    return raw as RecurringState;
  }
  throw new CopilotMoneyError(
    'CACHE_DECODE_ERROR',
    `${ENTITY_KIND} ${entityId} has unknown state: ${raw}`
  );
}

export function decodeRecurring(
  key: string,
  doc: FirestoreDocument
): Recurring {
  const { userId, recurringId } = parseKey(key);
  const f = doc.fields;

  // Prefer the `id` field when Copilot wrote one (44/51 docs in this cache),
  // fall back to the path segment. The two are always equal when both
  // exist, but the path segment is the structural truth.
  const idField = optionalString(f, 'id');
  const id = idField && idField.length > 0 ? idField : recurringId;

  const name = requireString(f, 'name', ENTITY_KIND, recurringId);
  const categoryId = requireString(f, 'category_id', ENTITY_KIND, recurringId);
  const rawState = requireString(f, 'state', ENTITY_KIND, recurringId);
  const state = toState(rawState, recurringId);

  return {
    id,
    userId,
    name,
    // `amount` is stored as doubleValue or integerValue; `optionalNumber`
    // normalizes both via FirestoreValue.toJs. 10/51 docs omit it (amount
    // unknown until Copilot observes enough instances) — null is expected.
    amount: optionalNumber(f, 'amount'),
    emoji: optionalString(f, 'emoji'),
    frequency: optionalString(f, 'frequency'),
    latestDate: optionalString(f, 'latest_date'),
    categoryId,
    state,
    isActive: state === 'active',
    matchString: optionalString(f, 'match_string'),
  };
}
