/**
 * Firestore -> Account decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path (`items/{item_id}/accounts/{account_id}`) and produces
 * our `Account` shape. Field names come from inspecting real cache documents
 * (see docs/research/2026-04-17-firestore-leveldb-format.md and the Task 13
 * Step-0 discovery script); they are Plaid-flavored snake_case, not our TS
 * camelCase. Key mappings:
 *
 *   Firestore field               -> Account property
 *   -----------------------------    -----------------------------
 *   (from key path)               -> id, itemId
 *   name                          -> name
 *   type + subtype                -> type  (Plaid type normalized to our enum)
 *   subtype                       -> subType
 *   current_balance (int cents)   -> balance
 *   available_balance             -> liveBalance
 *   live_balance_backend_disabled -> hasLiveBalance (inverted)
 *   limit                         -> limit
 *   mask                          -> mask
 *   color                         -> color (empty string coerced to null)
 *   institution_id                -> institutionId
 *   is_manual                     -> isManual (absent on Plaid-linked accounts)
 *   dashboard_active              -> isUserHidden (inverted)
 *   user_deleted                  -> isUserClosed
 *   latest_balance_update         -> latestBalanceUpdate (ISO timestamp)
 *   historical_update             -> hasHistoricalUpdates
 */

import type { Account, AccountType } from '../../types/account.js';
import { CopilotMoneyError } from '../../types/error.js';
import {
  FirestoreValue,
  type FirestoreDocument,
  type FirestoreValueShape,
} from '../protobuf.js';

const KEY_PATTERN = /^items\/([^/]+)\/accounts\/([^/]+)$/;

function parseKey(key: string): { itemId: string; accountId: string } {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Bad account key: ${key}`
    );
  }
  return { itemId: match[1], accountId: match[2] };
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

function requireString(
  fields: Record<string, FirestoreValueShape>,
  name: string,
  accountId: string
): string {
  const raw = fields[name];
  if (!raw) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Account ${accountId} missing required field: ${name}`
    );
  }
  const js = FirestoreValue.toJs(raw);
  if (!isString(js)) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Account ${accountId} field ${name} is not a string`
    );
  }
  return js;
}

function requireNumber(
  fields: Record<string, FirestoreValueShape>,
  name: string,
  accountId: string
): number {
  const raw = fields[name];
  if (!raw) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Account ${accountId} missing required field: ${name}`
    );
  }
  const js = FirestoreValue.toJs(raw);
  if (!isNumber(js)) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Account ${accountId} field ${name} is not a number`
    );
  }
  return js;
}

function optionalString(
  fields: Record<string, FirestoreValueShape>,
  name: string
): string | null {
  const raw = fields[name];
  if (!raw) return null;
  const js = FirestoreValue.toJs(raw);
  return isString(js) ? js : null;
}

function optionalNumber(
  fields: Record<string, FirestoreValueShape>,
  name: string
): number | null {
  const raw = fields[name];
  if (!raw) return null;
  const js = FirestoreValue.toJs(raw);
  return isNumber(js) ? js : null;
}

function optionalBoolean(
  fields: Record<string, FirestoreValueShape>,
  name: string
): boolean | null {
  const raw = fields[name];
  if (!raw) return null;
  const js = FirestoreValue.toJs(raw);
  return isBoolean(js) ? js : null;
}

/**
 * Normalize Copilot's Plaid-style `type`/`subtype` into our `AccountType`.
 * Plaid's taxonomy has `depository`/`credit`/`loan`/`investment`/`other`;
 * `depository` covers both checking and savings, so we disambiguate via
 * `subtype` when possible. Anything unknown falls through to `other`.
 */
function resolveAccountType(rawType: string | null, rawSubtype: string | null): AccountType {
  if (rawType === 'credit') return 'credit';
  if (rawType === 'loan') return 'loan';
  if (rawType === 'investment') return 'investment';
  if (rawType === 'depository') {
    if (rawSubtype === 'savings') return 'savings';
    if (rawSubtype === 'checking') return 'checking';
    return 'checking';
  }
  return 'other';
}

export function decodeAccount(key: string, doc: FirestoreDocument): Account {
  const { itemId, accountId } = parseKey(key);
  const f = doc.fields;

  const name = requireString(f, 'name', accountId);
  const balance = requireNumber(f, 'current_balance', accountId);

  const rawType = optionalString(f, 'type');
  const subType = optionalString(f, 'subtype');

  const rawColor = optionalString(f, 'color');
  const color = rawColor && rawColor.length > 0 ? rawColor : null;

  const liveBalanceBackendDisabled = optionalBoolean(f, 'live_balance_backend_disabled');
  const hasLiveBalance = liveBalanceBackendDisabled === null ? false : !liveBalanceBackendDisabled;

  const dashboardActive = optionalBoolean(f, 'dashboard_active');
  const isUserHidden = dashboardActive === null ? false : !dashboardActive;

  return {
    id: accountId,
    itemId,
    name,
    type: resolveAccountType(rawType, subType),
    subType,
    balance,
    liveBalance: optionalNumber(f, 'available_balance'),
    hasLiveBalance,
    limit: optionalNumber(f, 'limit'),
    mask: optionalString(f, 'mask'),
    color,
    institutionId: optionalString(f, 'institution_id'),
    isManual: optionalBoolean(f, 'is_manual') ?? false,
    isUserHidden,
    isUserClosed: optionalBoolean(f, 'user_deleted') ?? false,
    latestBalanceUpdate: optionalString(f, 'latest_balance_update'),
    hasHistoricalUpdates: optionalBoolean(f, 'historical_update') ?? false,
  };
}
