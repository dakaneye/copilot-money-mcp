/**
 * Firestore Document protobuf wire-format decoder.
 *
 * Portions of the wire-format parser below (varint reader, tag/wire-type
 * handling, submessage recursion, Value/MapValue/ArrayValue/Timestamp/GeoPoint
 * parsing) are ported from the reference MCP:
 *
 *   ignaciohermosillacornejo/copilot-money-mcp
 *   src/core/protobuf-parser.ts
 *   MIT License, https://github.com/ignaciohermosillacornejo/copilot-money-mcp/blob/main/LICENSE
 *
 * The original author's copyright and license terms are preserved in the
 * upstream LICENSE. This file adapts the parser to our types and error model
 * (CopilotMoneyError('CACHE_DECODE_ERROR', ...)) and exposes a different
 * public shape — the Firestore JSON-style `{ stringValue, integerValue, ... }`
 * union that our decoders work against. Only the MaybeDocument -> Document ->
 * fields path is implemented; mutation-queue and target-key parsing is out of
 * scope.
 *
 * Wire format reference: https://protobuf.dev/programming-guides/encoding/
 * Firestore Value proto: https://github.com/googleapis/googleapis/blob/master/google/firestore/v1/document.proto
 */

import { Buffer } from 'node:buffer';
import { CopilotMoneyError } from '../types/error.js';

/**
 * A decoded Firestore document.
 *
 * `fields` maps field names to their Firestore value shape. `name` is the
 * document path (`projects/.../documents/users/{uid}/categories/{id}`) when
 * the upstream MaybeDocument included it. `createTime` / `updateTime` are
 * optional ISO 8601 strings derived from the wire-format Timestamp messages.
 */
export interface FirestoreDocument {
  name?: string;
  fields: Record<string, FirestoreValueShape>;
  createTime?: string;
  updateTime?: string;
}

/**
 * Firestore's Value oneof, expressed in the same JSON-compatible shape that
 * the public Firestore REST API uses. Our decoders (accounts, transactions,
 * categories, ...) consume this shape field by field, which makes them easy
 * to test against fixture JSON.
 */
export type FirestoreValueShape =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { bytesValue: Uint8Array }
  | { referenceValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { arrayValue: { values: FirestoreValueShape[] } }
  | { mapValue: { fields: Record<string, FirestoreValueShape> } };

/** Helpers to coerce a FirestoreValueShape into a plain JS value. */
export const FirestoreValue = {
  toJs(v: FirestoreValueShape): unknown {
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('stringValue' in v) return v.stringValue;
    if ('bytesValue' in v) return v.bytesValue;
    if ('referenceValue' in v) return v.referenceValue;
    if ('geoPointValue' in v) return v.geoPointValue;
    if ('arrayValue' in v) return v.arrayValue.values.map((x) => FirestoreValue.toJs(x));
    if ('mapValue' in v) {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v.mapValue.fields)) out[k] = FirestoreValue.toJs(vv);
      return out;
    }
    return undefined;
  },
};

// ---------------------------------------------------------------------------
// Wire-format primitives (ported from the reference parser)
// ---------------------------------------------------------------------------

/** Protobuf wire types. */
const enum WireType {
  Varint = 0,
  Fixed64 = 1,
  LengthDelimited = 2,
  StartGroup = 3,
  EndGroup = 4,
  Fixed32 = 5,
}

/** Firestore Value field numbers (google/firestore/v1/document.proto). */
const enum ValueField {
  BooleanValue = 1,
  IntegerValue = 2,
  DoubleValue = 3,
  ReferenceValue = 5,
  MapValue = 6,
  GeoPointValue = 8,
  ArrayValue = 9,
  TimestampValue = 10,
  NullValue = 11,
  StringValue = 17,
  BytesValue = 18,
}

interface VarintResult {
  value: number;
  bytesRead: number;
}

/**
 * Decode a protobuf varint starting at `pos`. Uses BigInt internally so we
 * preserve the full 64-bit range; the caller receives a JS number (which
 * loses precision for values above 2^53 — acceptable for Firestore orders,
 * counts, and the like, but transaction amounts live in string-encoded
 * integerValue fields so this is fine).
 */
function readVarint(data: Buffer, pos: number): VarintResult {
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;

  while (pos + bytesRead < data.length) {
    const byte = data[pos + bytesRead];
    if (byte === undefined) {
      throw new Error(`Truncated varint at position ${pos + bytesRead}`);
    }

    result |= BigInt(byte & 0x7f) << shift;
    bytesRead++;

    if ((byte & 0x80) === 0) {
      const maxInt64 = (1n << 63n) - 1n;
      if (result > maxInt64) {
        result = result - (1n << 64n);
      }
      return { value: Number(result), bytesRead };
    }

    shift += 7n;
    if (shift >= 64n) {
      throw new Error(`Varint too long at position ${pos}`);
    }
  }

  throw new Error(`Truncated varint at position ${pos}`);
}

/**
 * Decode a protobuf varint and return the unsigned BigInt representation.
 * We use this for integer field values because Firestore encodes 64-bit
 * integers (e.g. transaction amounts in minor units) and we want to
 * stringify them without loss.
 */
function readVarintBigInt(data: Buffer, pos: number): { value: bigint; bytesRead: number } {
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;

  while (pos + bytesRead < data.length) {
    const byte = data[pos + bytesRead];
    if (byte === undefined) {
      throw new Error(`Truncated varint at position ${pos + bytesRead}`);
    }

    result |= BigInt(byte & 0x7f) << shift;
    bytesRead++;

    if ((byte & 0x80) === 0) {
      const maxInt64 = (1n << 63n) - 1n;
      if (result > maxInt64) {
        result = result - (1n << 64n);
      }
      return { value: result, bytesRead };
    }

    shift += 7n;
    if (shift >= 64n) {
      throw new Error(`Varint too long at position ${pos}`);
    }
  }

  throw new Error(`Truncated varint at position ${pos}`);
}

/** Split a tag byte into field number + wire type. */
function parseTag(tag: number): { fieldNumber: number; wireType: WireType } {
  return {
    fieldNumber: tag >>> 3,
    wireType: (tag & 0x07) as WireType,
  };
}

/** Advance past a field whose contents we don't care about. */
function skipField(data: Buffer, pos: number, wireType: WireType): number {
  switch (wireType) {
    case WireType.Varint: {
      const { bytesRead } = readVarint(data, pos);
      return bytesRead;
    }
    case WireType.Fixed64:
      return 8;
    case WireType.LengthDelimited: {
      const { value: length, bytesRead } = readVarint(data, pos);
      return bytesRead + length;
    }
    case WireType.Fixed32:
      return 4;
    case WireType.StartGroup:
    case WireType.EndGroup:
      throw new Error(`Deprecated wire type ${String(wireType)} not supported`);
    default:
      throw new Error(`Unknown wire type ${String(wireType)}`);
  }
}

// ---------------------------------------------------------------------------
// Firestore message parsers (ported from the reference parser)
// ---------------------------------------------------------------------------

/**
 * Parse a Timestamp submessage (google.protobuf.Timestamp) into an ISO 8601
 * string. Firestore uses seconds:int64 + nanos:int32; we render with 9-digit
 * nanosecond precision, trimmed to the zones JS `Date.toISOString` produces
 * for consistency with server-returned timestamps.
 */
function parseTimestamp(data: Buffer, start: number, end: number): string {
  let pos = start;
  let seconds = 0;
  let nanos = 0;

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    if (fieldNumber === 1 && wireType === WireType.Varint) {
      const { value, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      seconds = value;
    } else if (fieldNumber === 2 && wireType === WireType.Varint) {
      const { value, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      nanos = value;
    } else {
      pos += skipField(data, pos, wireType);
    }
  }

  // Build an ISO string. Date.toISOString gives millisecond precision, so we
  // splice in the nanos fraction to match Firestore's `.nnnnnnnnnZ` format.
  const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
  const base = new Date(ms).toISOString(); // ends in ".mmmZ"
  const nsPart = String(nanos).padStart(9, '0');
  return `${base.slice(0, -5)}.${nsPart}Z`;
}

function parseGeoPoint(
  data: Buffer,
  start: number,
  end: number
): { latitude: number; longitude: number } {
  let pos = start;
  let latitude = 0;
  let longitude = 0;

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    if (fieldNumber === 1 && wireType === WireType.Fixed64) {
      latitude = data.readDoubleLE(pos);
      pos += 8;
    } else if (fieldNumber === 2 && wireType === WireType.Fixed64) {
      longitude = data.readDoubleLE(pos);
      pos += 8;
    } else {
      pos += skipField(data, pos, wireType);
    }
  }

  return { latitude, longitude };
}

/** Parse a Firestore Value oneof from a bounded slice of bytes. */
function parseValue(data: Buffer, start: number, end: number): FirestoreValueShape {
  let pos = start;

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    switch (fieldNumber) {
      case ValueField.BooleanValue: {
        if (wireType !== WireType.Varint) {
          throw new Error(`Expected varint for boolean, got wire type ${String(wireType)}`);
        }
        const { value } = readVarint(data, pos);
        return { booleanValue: value !== 0 };
      }

      case ValueField.IntegerValue: {
        if (wireType !== WireType.Varint) {
          throw new Error(`Expected varint for integer, got wire type ${String(wireType)}`);
        }
        const { value } = readVarintBigInt(data, pos);
        return { integerValue: value.toString() };
      }

      case ValueField.DoubleValue: {
        if (wireType !== WireType.Fixed64) {
          throw new Error(`Expected fixed64 for double, got wire type ${String(wireType)}`);
        }
        return { doubleValue: data.readDoubleLE(pos) };
      }

      case ValueField.ReferenceValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(
            `Expected length-delimited for reference, got wire type ${String(wireType)}`
          );
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return { referenceValue: data.subarray(pos, pos + length).toString('utf8') };
      }

      case ValueField.StringValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(
            `Expected length-delimited for string, got wire type ${String(wireType)}`
          );
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return { stringValue: data.subarray(pos, pos + length).toString('utf8') };
      }

      case ValueField.BytesValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(
            `Expected length-delimited for bytes, got wire type ${String(wireType)}`
          );
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        const slice = data.subarray(pos, pos + length);
        // Return an independent Uint8Array so callers can't mutate the buffer.
        return { bytesValue: new Uint8Array(slice) };
      }

      case ValueField.NullValue: {
        if (wireType !== WireType.Varint) {
          throw new Error(`Expected varint for null, got wire type ${String(wireType)}`);
        }
        readVarint(data, pos); // consume the 0
        return { nullValue: null };
      }

      case ValueField.TimestampValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(
            `Expected length-delimited for timestamp, got wire type ${String(wireType)}`
          );
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return { timestampValue: parseTimestamp(data, pos, pos + length) };
      }

      case ValueField.GeoPointValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(
            `Expected length-delimited for geopoint, got wire type ${String(wireType)}`
          );
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return { geoPointValue: parseGeoPoint(data, pos, pos + length) };
      }

      case ValueField.MapValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(`Expected length-delimited for map, got wire type ${String(wireType)}`);
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return { mapValue: { fields: parseMapValueFields(data, pos, pos + length) } };
      }

      case ValueField.ArrayValue: {
        if (wireType !== WireType.LengthDelimited) {
          throw new Error(
            `Expected length-delimited for array, got wire type ${String(wireType)}`
          );
        }
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return { arrayValue: { values: parseArrayValueEntries(data, pos, pos + length) } };
      }

      default: {
        // Unknown field — skip it and keep looking for the Value oneof.
        pos += skipField(data, pos, wireType);
      }
    }
  }

  // Empty Value message — treat as null so the caller has something consistent.
  return { nullValue: null };
}

/**
 * Parse a MapValue.fields map entries blob. Each entry is a length-delimited
 * submessage with field 1 (key: string) and field 2 (value: Value).
 */
function parseMapValueFields(
  data: Buffer,
  start: number,
  end: number
): Record<string, FirestoreValueShape> {
  const out: Record<string, FirestoreValueShape> = {};
  let pos = start;

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    if (fieldNumber === 1 && wireType === WireType.LengthDelimited) {
      const { value: entryLength, bytesRead } = readVarint(data, pos);
      pos += bytesRead;

      const entry = parseMapEntry(data, pos, pos + entryLength);
      if (entry.key !== null) {
        out[entry.key] = entry.value;
      }
      pos += entryLength;
    } else {
      pos += skipField(data, pos, wireType);
    }
  }

  return out;
}

/** Parse a single map entry (key=1 string, value=2 Value). */
function parseMapEntry(
  data: Buffer,
  start: number,
  end: number
): { key: string | null; value: FirestoreValueShape } {
  let pos = start;
  let key: string | null = null;
  let value: FirestoreValueShape = { nullValue: null };

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    if (fieldNumber === 1 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      key = data.subarray(pos, pos + length).toString('utf8');
      pos += length;
    } else if (fieldNumber === 2 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      value = parseValue(data, pos, pos + length);
      pos += length;
    } else {
      pos += skipField(data, pos, wireType);
    }
  }

  return { key, value };
}

/** Parse an ArrayValue.values repeated field (field 1, each a Value). */
function parseArrayValueEntries(
  data: Buffer,
  start: number,
  end: number
): FirestoreValueShape[] {
  const out: FirestoreValueShape[] = [];
  let pos = start;

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    if (fieldNumber === 1 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      out.push(parseValue(data, pos, pos + length));
      pos += length;
    } else {
      pos += skipField(data, pos, wireType);
    }
  }

  return out;
}

/**
 * Parse the inner Document proto.
 *
 * Document fields in the wire format:
 *   - 1: name (string, the document path)
 *   - 2: fields — but in Firestore's LevelDB encoding this is *repeated*
 *        MapValue-like entries directly (not wrapped in a single MapValue).
 *        Each entry is a submessage with key=1 string, value=2 Value.
 *   - 3: create_time (Timestamp)
 *   - 4: update_time (Timestamp)
 */
function parseDocument(data: Buffer, start: number, end: number): FirestoreDocument {
  let pos = start;
  const fields: Record<string, FirestoreValueShape> = {};
  let name: string | undefined;
  let createTime: string | undefined;
  let updateTime: string | undefined;

  while (pos < end) {
    const tagResult = readVarint(data, pos);
    pos += tagResult.bytesRead;
    const { fieldNumber, wireType } = parseTag(tagResult.value);

    if (fieldNumber === 1 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      name = data.subarray(pos, pos + length).toString('utf8');
      pos += length;
    } else if (fieldNumber === 2 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      const entry = parseMapEntry(data, pos, pos + length);
      if (entry.key !== null) {
        fields[entry.key] = entry.value;
      }
      pos += length;
    } else if (fieldNumber === 3 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      createTime = parseTimestamp(data, pos, pos + length);
      pos += length;
    } else if (fieldNumber === 4 && wireType === WireType.LengthDelimited) {
      const { value: length, bytesRead } = readVarint(data, pos);
      pos += bytesRead;
      updateTime = parseTimestamp(data, pos, pos + length);
      pos += length;
    } else {
      pos += skipField(data, pos, wireType);
    }
  }

  return { name, fields, createTime, updateTime };
}

/**
 * Decode a Firestore LevelDB remote_document value.
 *
 * The on-disk bytes are a `MaybeDocument` wrapper:
 *
 *   message MaybeDocument {
 *     oneof document_type {
 *       NoDocument no_document = 1;
 *       Document   document    = 2;
 *       UnknownDocument unknown_document = 3;
 *     }
 *     ...
 *   }
 *
 * We unwrap to the inner Document. If the payload doesn't contain a Document
 * (NoDocument, UnknownDocument, or malformed), we throw
 * `CopilotMoneyError('CACHE_DECODE_ERROR', ...)` — callers are expected to
 * filter tombstones before calling us.
 */
export function decodeFirestoreDocument(bytes: Uint8Array): FirestoreDocument {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  try {
    let pos = 0;
    while (pos < data.length) {
      const tagResult = readVarint(data, pos);
      pos += tagResult.bytesRead;
      const { fieldNumber, wireType } = parseTag(tagResult.value);

      if (fieldNumber === 2 && wireType === WireType.LengthDelimited) {
        const { value: length, bytesRead } = readVarint(data, pos);
        pos += bytesRead;
        return parseDocument(data, pos, pos + length);
      }

      pos += skipField(data, pos, wireType);
    }

    throw new Error('MaybeDocument contained no Document field');
  } catch (err) {
    if (err instanceof CopilotMoneyError) throw err;
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Failed to decode Firestore document: ${(err as Error).message}`
    );
  }
}
