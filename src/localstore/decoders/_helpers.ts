/**
 * Shared helpers for Firestore -> domain type decoders.
 *
 * Each decoder (accounts, categories, tags, ...) reads fields from a
 * `FirestoreDocument.fields` map and must distinguish "missing" (throw), "wrong
 * type" (throw), and "present" (return typed). The patterns are identical
 * across decoders, so we centralize them here to keep the per-entity decoders
 * focused on field-name mapping.
 */

import { CopilotMoneyError } from '../../types/error.js';
import {
  FirestoreValue,
  type FirestoreValueShape,
} from '../protobuf.js';

export const isString = (v: unknown): v is string => typeof v === 'string';
export const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * Required-field readers: throw `CACHE_DECODE_ERROR` if absent or wrong type.
 * `entityKind`/`entityId` feed the error message so upstream logs can
 * distinguish "Account X missing name" from "Category Y missing name".
 */
export function requireString(
  fields: Record<string, FirestoreValueShape>,
  name: string,
  entityKind: string,
  entityId: string
): string {
  const raw = fields[name];
  if (!raw) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${entityKind} ${entityId} missing required field: ${name}`
    );
  }
  const js = FirestoreValue.toJs(raw);
  if (!isString(js)) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${entityKind} ${entityId} field ${name} is not a string`
    );
  }
  return js;
}

export function requireNumber(
  fields: Record<string, FirestoreValueShape>,
  name: string,
  entityKind: string,
  entityId: string
): number {
  const raw = fields[name];
  if (!raw) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${entityKind} ${entityId} missing required field: ${name}`
    );
  }
  const js = FirestoreValue.toJs(raw);
  if (!isNumber(js)) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `${entityKind} ${entityId} field ${name} is not a number`
    );
  }
  return js;
}

/** Optional-field readers: missing or wrong-typed -> null, never throw. */
export function optionalString(
  fields: Record<string, FirestoreValueShape>,
  name: string
): string | null {
  const raw = fields[name];
  if (!raw) return null;
  const js = FirestoreValue.toJs(raw);
  return isString(js) ? js : null;
}

export function optionalNumber(
  fields: Record<string, FirestoreValueShape>,
  name: string
): number | null {
  const raw = fields[name];
  if (!raw) return null;
  const js = FirestoreValue.toJs(raw);
  return isNumber(js) ? js : null;
}

export function optionalBoolean(
  fields: Record<string, FirestoreValueShape>,
  name: string
): boolean | null {
  const raw = fields[name];
  if (!raw) return null;
  const js = FirestoreValue.toJs(raw);
  return isBoolean(js) ? js : null;
}
