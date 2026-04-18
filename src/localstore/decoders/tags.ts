/**
 * Firestore -> Tag decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path (`users/{user_id}/tags/{tag_id}`) and produces our
 * `Tag` shape.
 *
 *   Firestore field   -> Tag property
 *   ---------------     -----------------------------
 *   (from key path)   -> id
 *   name              -> name (required)
 *   color_name        -> colorName  (palette token, e.g. "green10")
 *   hex_color         -> colorName fallback when color_name is absent
 *
 * Older tag documents (created before Copilot's palette-token migration) only
 * carry `hex_color` (e.g. "#42AF25FF"). Newer tags carry both. We prefer
 * the palette token but fall back to the hex string so older tags don't fail
 * to decode. If neither field is present, `colorName` is an empty string.
 */

import type { Tag } from '../../types/tag.js';
import { CopilotMoneyError } from '../../types/error.js';
import type { FirestoreDocument } from '../protobuf.js';
import { requireString, optionalString } from './_helpers.js';

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
  const colorName = optionalString(f, 'color_name') ?? optionalString(f, 'hex_color') ?? '';

  return {
    id: tagId,
    name,
    colorName,
  };
}
