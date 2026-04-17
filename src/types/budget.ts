/**
 * Per-category budget tracked by Copilot Money.
 *
 * Sourced from the `users/{user_id}/budgets/{budget_id}` Firestore collection.
 * Field-name mapping verified empirically against this user's real cache (Task
 * 18 scan of all 26 budget documents) and cross-checked against the reference
 * MCP's `processBudget`
 * (ignaciohermosillacornejo/copilot-money-mcp, src/core/decoder.ts).
 *
 * Shape in this cache: one budget doc per category. Budgets are identified by
 * their own ID (`{budget_id}` path segment, equal to the `id` field when
 * written). Monthly overrides are carried inline in an `amounts` map.
 *
 *   Firestore field     -> Budget property
 *   ------------------     -----------------------------
 *   (from key path)     -> userId
 *   id                  -> id (preferred when present; falls back to path
 *                          segment — 21/26 docs carry `id`, 5 omit it)
 *   category_id         -> categoryId (always present in cache — 26/26)
 *   amount (double|int) -> defaultAmount (monthly default; 23/26 use
 *                          doubleValue, 3/26 integerValue for whole-dollar
 *                          budgets; 0 is a valid value)
 *   amounts (map)       -> monthlyOverrides (map of "YYYY-MM" -> number,
 *                          null when absent; 20/26 docs carry an `amounts`
 *                          map, but only 4/26 have a non-empty map)
 *
 * Deliberately NOT surfaced (present in the reference MCP's schema but
 * absent from every doc in this cache — YAGNI, add only when a tool needs
 * them and a real doc has them):
 *   - name, period, start_date, end_date, is_active, iso_currency_code
 *
 * Shape note vs. reference MCP: the reference MCP's `BudgetSchema` is broader
 * — every field beyond budget_id is marked `.optional()` there, and it also
 * supports `period: 'monthly' | 'yearly' | 'weekly' | 'daily'` and date-range
 * budgets. Neither this user's cache nor Copilot's current web UI appear to
 * use any of those; if a future cache sample shows them, extend this type
 * rather than working around it.
 *
 * Related but DIFFERENT shape: `CategoryBudget` and `BudgetMonth` in
 * `src/types/category.ts` represent aggregated, computed budget views (current
 * month + histories, with derived fields like `rolloverAmount` and
 * `resolvedAmount`). Those are a presentation concern — callers that want the
 * aggregated view should compose it from the raw Budget plus
 * category/transaction data. The decoder returns source data only.
 *
 * `defaultAmount` is the monthly default spending limit in dollars. Matches
 * the reference MCP's `amount` field directly. Observed zero values (12/26
 * docs in this cache) are surfaced verbatim — semantic interpretation
 * ("tracked but no cap" vs. "explicit $0 cap") is a presentation concern.
 */

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  defaultAmount: number;
  monthlyOverrides: Record<string, number> | null;
}
