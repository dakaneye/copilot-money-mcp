/**
 * Binary Firestore LevelDB key-path decoder.
 *
 * Copilot Money's LevelDB keys are binary; the entity path (e.g.
 * `items/ITEM_1/accounts/ACCT_1/transactions/TXN_1`) is embedded inside
 * marker bytes. The full format and observed markers are documented in
 * docs/research/2026-04-17-firestore-leveldb-format.md.
 *
 * Shape of a `remote_document` key:
 *
 *   \x85 remote_document \x00 \x01
 *   \xbe <ascii-segment> \x00 \x01     -- collection name
 *   \xbe <ascii-segment> \x00 \x01     -- document id
 *   ... repeated ...
 *   \x80                                -- end-of-key marker
 *
 * Collection names and document ids alternate. The decoder returns the path
 * formed by joining all ASCII segments with `/`. Non-`remote_document` keys
 * (`target`, `collection_parent`, `version`, and friends) return `null` —
 * LocalStore skips them silently.
 *
 * We are deliberately conservative: any malformed key (truncated, missing
 * markers, non-ASCII segment) also returns `null` rather than throwing, so a
 * single corrupt key never breaks a full-cache scan. Per-entity decoders are
 * the right layer to surface structured decode errors.
 */

/** Prefix byte present on every LevelDB key produced by Firestore. */
const KEY_TYPE_TAG = 0x85;
/** Segment-pair separator: `\x00\x01`. */
const SEP_BYTE_0 = 0x00;
const SEP_BYTE_1 = 0x01;
/** Per-segment marker on collection names and document ids. */
const SEGMENT_MARKER = 0xbe;
/** End-of-key marker. */
const TERMINATOR = 0x80;

const REMOTE_DOCUMENT = 'remote_document';

/**
 * Decode a Firestore LevelDB key into its entity path.
 *
 * Returns `null` for keys that are not `remote_document` entries, or for any
 * malformed key we can't cleanly parse. Callers must check for `null` and
 * skip; an empty string is never returned.
 */
export function decodeKeyPath(buf: Uint8Array): string | null {
  // Minimum viable key: \x85 + "remote_document" + \x00\x01 + \x80.
  if (buf.length < 1 + REMOTE_DOCUMENT.length + 2 + 1) return null;
  if (buf[0] !== KEY_TYPE_TAG) return null;

  // Read the key-type label (ASCII up to \x00\x01).
  let pos = 1;
  const labelStart = pos;
  while (pos < buf.length && buf[pos] !== SEP_BYTE_0) pos++;
  // We need at least `\x00\x01` after the label.
  if (pos + 1 >= buf.length) return null;
  if (buf[pos] !== SEP_BYTE_0 || buf[pos + 1] !== SEP_BYTE_1) return null;

  const label = decodeAscii(buf, labelStart, pos);
  if (label !== REMOTE_DOCUMENT) return null;

  pos += 2; // past the `\x00\x01` after the label

  // Read repeating \xbe<segment>\x00\x01 groups until we hit \x80.
  const segments: string[] = [];
  while (pos < buf.length) {
    const byte = buf[pos];
    if (byte === TERMINATOR) {
      // Reached end-of-key. Trailing bytes (if any) are ignored.
      return segments.length > 0 ? segments.join('/') : null;
    }
    if (byte !== SEGMENT_MARKER) return null;
    pos++; // consume \xbe

    const segStart = pos;
    // Walk to the next \x00\x01 separator — or to the terminator if this is
    // somehow the last segment without a trailing separator.
    while (pos < buf.length && buf[pos] !== SEP_BYTE_0 && buf[pos] !== TERMINATOR) {
      pos++;
    }
    if (pos >= buf.length) return null;

    const segment = decodeAscii(buf, segStart, pos);
    if (segment.length === 0) return null;
    segments.push(segment);

    if (buf[pos] === TERMINATOR) {
      // Segment ran straight into the terminator without a trailing separator.
      return segments.join('/');
    }
    // buf[pos] === SEP_BYTE_0 — require the full `\x00\x01` pair.
    if (pos + 1 >= buf.length || buf[pos + 1] !== SEP_BYTE_1) return null;
    pos += 2;
  }

  // Ran off the end without finding a terminator.
  return null;
}

/**
 * Decode a byte range as ASCII. Any non-ASCII byte (>= 0x80) invalidates the
 * segment — real Copilot IDs are base-62 and collection names are lowercase
 * ASCII, so a high byte indicates we lost the frame.
 */
function decodeAscii(buf: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) {
    const c = buf[i];
    if (c < 0x20 || c > 0x7e) return '';
    out += String.fromCharCode(c);
  }
  return out;
}

/**
 * Encode a `remote_document` path back to the binary key format Copilot
 * writes. Exposed for test fixtures — production code never constructs keys.
 * Throws if any segment contains non-ASCII characters.
 */
export function encodeRemoteDocumentKey(path: string): Uint8Array {
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error('encodeRemoteDocumentKey: empty path');
  }
  const parts: number[] = [];
  parts.push(KEY_TYPE_TAG);
  for (const char of REMOTE_DOCUMENT) parts.push(char.charCodeAt(0));
  parts.push(SEP_BYTE_0, SEP_BYTE_1);
  for (const segment of segments) {
    parts.push(SEGMENT_MARKER);
    for (let i = 0; i < segment.length; i++) {
      const c = segment.charCodeAt(i);
      if (c < 0x20 || c > 0x7e) {
        throw new Error(
          `encodeRemoteDocumentKey: non-ASCII byte in segment '${segment}'`
        );
      }
      parts.push(c);
    }
    parts.push(SEP_BYTE_0, SEP_BYTE_1);
  }
  parts.push(TERMINATOR);
  return Uint8Array.from(parts);
}
