/**
 * Firestore -> Budget decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path (`users/{user_id}/budgets/{budget_id}`) and produces
 * our `Budget` shape.
 *
 * Field-name mapping verified empirically against all 26 budget documents in
 * this user's Firestore cache (Task 18 scan) and cross-checked against the
 * reference MCP's `processBudget`:
 *
 *   ignaciohermosillacornejo/copilot-money-mcp
 *   src/core/decoder.ts
 *   MIT License, https://github.com/ignaciohermosillacornejo/copilot-money-mcp/blob/main/LICENSE
 *
 * The reference MCP's `BudgetSchema` is broader (name, period, start_date,
 * end_date, is_active, iso_currency_code) — none of those fields appear in
 * any budget doc in this cache. We intentionally narrow to the fields Copilot
 * actually persists today (see `src/types/budget.ts` for the rationale). If a
 * future sample exposes any of those fields, extend the type rather than
 * papering over a mapping gap.
 *
 * Shape divergence from the reference MCP's tolerant `parse` path: the
 * reference MCP returns `null` from `processBudget` on any malformed doc (and
 * separately filters zero-field "ghost" docs as tombstones). Here we throw
 * `CACHE_DECODE_ERROR` for missing required fields (`category_id`, `amount`)
 * — the LocalStore facade is the right layer to decide whether to skip or
 * propagate per-doc failures, and losing strict errors at the decoder makes
 * debugging real corruption much harder.
 */

import type { Budget } from '../../types/budget.js';
import { CopilotMoneyError } from '../../types/error.js';
import type { FirestoreDocument } from '../protobuf.js';
import {
  optionalNumberMap,
  optionalString,
  requireNumber,
  requireString,
} from './_helpers.js';

const KEY_PATTERN = /^users\/([^/]+)\/budgets\/([^/]+)$/;
const ENTITY_KIND = 'Budget';

function parseKey(key: string): { userId: string; budgetId: string } {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Bad budget key: ${key}`
    );
  }
  return { userId: match[1], budgetId: match[2] };
}

export function decodeBudget(key: string, doc: FirestoreDocument): Budget {
  const { userId, budgetId } = parseKey(key);
  const f = doc.fields;

  // Prefer the `id` field when Copilot wrote one (21/26 docs in this cache).
  // When both exist they are always equal to the path segment, so the path
  // segment is a safe fallback for the 5/26 docs that omit `id`.
  const idField = optionalString(f, 'id');
  const id = idField && idField.length > 0 ? idField : budgetId;

  const categoryId = requireString(f, 'category_id', ENTITY_KIND, budgetId);
  const defaultAmount = requireNumber(f, 'amount', ENTITY_KIND, budgetId);

  // `amounts` carries monthly overrides keyed by "YYYY-MM". 20/26 docs carry
  // the map, but only 4/26 have any entries — the rest are `{}`. `null` here
  // distinguishes "no map written" from "empty map written", which surfaces
  // the same information the tool layer has in the original doc without
  // forcing it to re-inspect raw Firestore shapes.
  const monthlyOverrides = optionalNumberMap(f, 'amounts');

  return {
    id,
    userId,
    categoryId,
    defaultAmount,
    monthlyOverrides,
  };
}
