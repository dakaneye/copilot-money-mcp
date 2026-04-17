/**
 * Firestore -> Tag decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path (`users/{user_id}/tags/{tag_id}`) and produces our
 * `Tag` shape.
 *
 * UNVERIFIED: this user's Firestore cache currently contains zero tag
 * documents, so we cannot round-trip a real `tag.hex` fixture. The field-name
 * mapping below is taken from the reference MCP's tag processor
 * (ignaciohermosillacornejo/copilot-money-mcp, src/core/decoder.ts
 * `processTag` — string fields: `name`, `color_name`, `hex_color`). When the
 * first real tag document appears in the cache, spot-check these field names
 * against the raw doc and promote this comment to "verified".
 *
 *   Firestore field   -> Tag property
 *   ---------------     -----------------------------
 *   (from key path)   -> id
 *   name              -> name
 *   color_name        -> colorName  (palette token, e.g. "PURPLE2", "OLIVE1")
 *
 * Unmapped Firestore fields (for future decoders/handlers):
 *   - `hex_color`     hex string (e.g. "#EC5602") — our Tag type surfaces
 *                     only the palette token `colorName`, matching GraphQL.
 */

import type { Tag } from '../../types/tag.js';
import { CopilotMoneyError } from '../../types/error.js';
import type { FirestoreDocument } from '../protobuf.js';
import { requireString } from './_helpers.js';

const KEY_PATTERN = /^users\/([^/]+)\/tags\/([^/]+)$/;
const ENTITY_KIND = 'Tag';

function parseKey(key: string): { userId: string; tagId: string } {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Bad tag key: ${key}`
    );
  }
  return { userId: match[1], tagId: match[2] };
}

export function decodeTag(key: string, doc: FirestoreDocument): Tag {
  const { tagId } = parseKey(key);
  const f = doc.fields;

  const name = requireString(f, 'name', ENTITY_KIND, tagId);
  const colorName = requireString(f, 'color_name', ENTITY_KIND, tagId);

  return {
    id: tagId,
    name,
    colorName,
  };
}
