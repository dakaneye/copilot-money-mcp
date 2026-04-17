/**
 * Recurring subscription / bill tracked by Copilot Money.
 *
 * Sourced from the `users/{user_id}/recurring/{recurring_id}` Firestore
 * collection. Field-name mapping from the cache (Task 17 empirical scan of
 * all 51 recurring docs in this user's cache, cross-checked against the
 * reference MCP's `processRecurring`):
 *
 *   Firestore field     -> Recurring property
 *   ------------------     -----------------------------
 *   (from key path)     -> id (fallback), userId
 *   id                  -> id (preferred over path segment; 44/51 docs have it)
 *   name                -> name
 *   amount (double|int) -> amount (nullable — 10/51 docs omit it)
 *   emoji               -> emoji
 *   frequency           -> frequency (free-form — observed values include
 *                           'monthly', 'annually', 'weekly', 'quarterly',
 *                           'semi-annually', 'bi-monthly', 'quad-monthly';
 *                           reference MCP also documents 'daily', 'biweekly',
 *                           'semiannually', 'bimonthly', 'quadmonthly',
 *                           'yearly'. Kept as string — callers that need to
 *                           render can normalize)
 *   latest_date         -> latestDate (YYYY-MM-DD; last occurrence observed)
 *   category_id         -> categoryId (always non-empty in cache)
 *   state               -> state: 'active' | 'paused' | 'archived'
 *   (derived from state) -> isActive
 *   match_string        -> matchString (internal Copilot pattern; useful when
 *                           surfacing why a recurring matched a transaction)
 *
 * Deliberately NOT surfaced (YAGNI — add only when a tool needs them):
 *   - min_amount, max_amount, expected_amount_override
 *   - days_filter (array in this cache, not a number; reference MCP treats it
 *     as number which would fail here)
 *   - transaction_ids, included_transaction_ids, excluded_transaction_ids
 *   - skip_filter_update, identification_method, _origin, plaid_category_id,
 *     iso_currency_code, merchant_name
 *
 * Also not surfaced: `accountId`, `nextDate`. Firestore recurring docs do not
 * store an account linkage, and `next_date` is not persisted — the reference
 * MCP *computes* it from `latest_date + frequency`. That's a presentation
 * concern; this decoder returns raw structured data.
 *
 * Amount sign convention (inherited from Copilot's on-disk format, mirrors
 * transactions): positive = expected debit/expense; negative = expected
 * credit/income (e.g. recurring FSA reimbursement). Two negative-amount docs
 * in this cache confirm the convention.
 */

export type RecurringState = 'active' | 'paused' | 'archived';

export interface Recurring {
  id: string;
  userId: string;
  name: string;
  amount: number | null;
  emoji: string | null;
  frequency: string | null;
  latestDate: string | null;
  categoryId: string;
  state: RecurringState;
  isActive: boolean;
  matchString: string | null;
}
