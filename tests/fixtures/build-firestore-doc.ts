/**
 * Minimal `MaybeDocument` protobuf encoder for LocalStore integration tests.
 *
 * Mirrors the field shapes our decoders read (stringValue, integerValue,
 * doubleValue, booleanValue, timestampValue, arrayValue, mapValue). Only
 * covers what the tests need — do NOT grow this into a general-purpose
 * protobuf encoder. The real parser lives in `src/localstore/protobuf.ts`;
 * this is fixture plumbing.
 *
 * Wire format reference: https://protobuf.dev/programming-guides/encoding/
 */

import { Buffer } from 'node:buffer';

export type DocField =
  | { stringValue: string }
  | { integerValue: number | string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: { seconds: number; nanos?: number } }
  | { arrayValue: DocField[] }
  | { mapValue: Record<string, DocField> };

// ---------------------------------------------------------------------------
// Wire-format primitives
// ---------------------------------------------------------------------------

function encodeVarint(value: number | bigint): Buffer {
  let v = typeof value === 'bigint' ? value : BigInt(value);
  const bytes: number[] = [];
  while (v > 0x7fn) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

function tag(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function lenDelimited(fieldNumber: number, body: Buffer): Buffer {
  return Buffer.concat([tag(fieldNumber, 2), encodeVarint(body.length), body]);
}

function varintField(fieldNumber: number, value: number | bigint): Buffer {
  return Buffer.concat([tag(fieldNumber, 0), encodeVarint(value)]);
}

function fixed64Field(fieldNumber: number, body: Buffer): Buffer {
  return Buffer.concat([tag(fieldNumber, 1), body]);
}

// ---------------------------------------------------------------------------
// Firestore Value encoder
// ---------------------------------------------------------------------------

/** Firestore Value field numbers (google/firestore/v1/document.proto). */
const VF = {
  BooleanValue: 1,
  IntegerValue: 2,
  DoubleValue: 3,
  MapValue: 6,
  ArrayValue: 9,
  TimestampValue: 10,
  StringValue: 17,
} as const;

function encodeTimestamp(seconds: number, nanos = 0): Buffer {
  const parts: Buffer[] = [];
  if (seconds !== 0) parts.push(varintField(1, seconds));
  if (nanos !== 0) parts.push(varintField(2, nanos));
  return Buffer.concat(parts);
}

function encodeValue(value: DocField): Buffer {
  if ('stringValue' in value) {
    return lenDelimited(VF.StringValue, Buffer.from(value.stringValue, 'utf8'));
  }
  if ('integerValue' in value) {
    const n =
      typeof value.integerValue === 'number'
        ? BigInt(value.integerValue)
        : BigInt(value.integerValue);
    return varintField(VF.IntegerValue, n);
  }
  if ('doubleValue' in value) {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(value.doubleValue);
    return fixed64Field(VF.DoubleValue, buf);
  }
  if ('booleanValue' in value) {
    return varintField(VF.BooleanValue, value.booleanValue ? 1 : 0);
  }
  if ('timestampValue' in value) {
    return lenDelimited(
      VF.TimestampValue,
      encodeTimestamp(value.timestampValue.seconds, value.timestampValue.nanos)
    );
  }
  if ('arrayValue' in value) {
    const inner = Buffer.concat(
      value.arrayValue.map((v) => lenDelimited(1, encodeValue(v)))
    );
    return lenDelimited(VF.ArrayValue, inner);
  }
  if ('mapValue' in value) {
    const inner = Buffer.concat(
      Object.entries(value.mapValue).map(([k, v]) => {
        const entry = Buffer.concat([
          lenDelimited(1, Buffer.from(k, 'utf8')),
          lenDelimited(2, encodeValue(v)),
        ]);
        return lenDelimited(1, entry);
      })
    );
    return lenDelimited(VF.MapValue, inner);
  }
  throw new Error(`Unsupported DocField: ${JSON.stringify(value)}`);
}

// ---------------------------------------------------------------------------
// Document / MaybeDocument encoders
// ---------------------------------------------------------------------------

export interface BuildDocInput {
  name?: string;
  fields: Record<string, DocField>;
  createTime?: { seconds: number; nanos?: number };
  updateTime?: { seconds: number; nanos?: number };
}

function encodeDocument(doc: BuildDocInput): Buffer {
  const parts: Buffer[] = [];
  if (doc.name) parts.push(lenDelimited(1, Buffer.from(doc.name, 'utf8')));
  for (const [k, v] of Object.entries(doc.fields)) {
    const entry = Buffer.concat([
      lenDelimited(1, Buffer.from(k, 'utf8')),
      lenDelimited(2, encodeValue(v)),
    ]);
    parts.push(lenDelimited(2, entry));
  }
  if (doc.createTime) {
    parts.push(
      lenDelimited(3, encodeTimestamp(doc.createTime.seconds, doc.createTime.nanos))
    );
  }
  if (doc.updateTime) {
    parts.push(
      lenDelimited(4, encodeTimestamp(doc.updateTime.seconds, doc.updateTime.nanos))
    );
  }
  return Buffer.concat(parts);
}

/**
 * Build a `MaybeDocument` byte blob (field 2: Document) suitable for feeding
 * to `decodeFirestoreDocument`. Tests store these bytes as the value for
 * their synthesized binary keys.
 */
export function buildMaybeDocument(doc: BuildDocInput): Uint8Array {
  const body = encodeDocument(doc);
  return lenDelimited(2, body);
}
