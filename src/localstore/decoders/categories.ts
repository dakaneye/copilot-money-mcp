/**
 * Firestore -> Category decoder.
 *
 * Reads one decoded `FirestoreDocument` (from `localstore/protobuf.ts`) plus
 * its LevelDB key path (`users/{user_id}/categories/{category_id}`) and
 * produces our `Category` shape's core fields. Tree-building
 * (`childCategories`) and aggregates (`spend`, `budget`) are deferred to the
 * tool handler (Task 21), which has access to the full category collection.
 *
 * Field names come from inspecting the real cache document in
 * tests/fixtures/protobuf-samples/category.hex. Observed fields:
 *
 *   Firestore field          -> Category property
 *   ----------------------      -----------------------------
 *   (from key path)          -> id
 *   name                     -> name
 *   color (hex, e.g. #EC5602)-> colorName
 *   emoji                    -> icon.unicode (absent/empty -> null)
 *   (not present)            -> templateId (always null; Copilot's templates
 *                               live in a separate collection)
 *   excluded                 -> isExcluded
 *   (not present)            -> isRolloverDisabled (default false; rollover
 *                               config lives on budgets, not categories)
 *   auto_delete_lock         -> canBeDeleted (inverted; absent -> true)
 *   (deferred)               -> childCategories (always [] from decoder)
 *
 * Unmapped Firestore fields (for future decoders/handlers):
 *   - `_origin`              source hint (e.g. "firebase")
 *   - `auto_budget_lock`     budget auto-lock flag
 *   - `bg_color`             light-mode background color
 *   - `id`                   duplicates the key path; we prefer the key
 *   - `is_other`             catch-all "Other" bucket flag
 *   - `order`                sort order within the parent
 *   - `parent_category_id`   used by the handler to build the tree; the core
 *                            Category type doesn't expose it here
 *   - `plaid_category_ids`   Plaid taxonomy mapping
 */

import type { Category, CategoryIcon } from '../../types/category.js';
import { CopilotMoneyError } from '../../types/error.js';
import type { FirestoreDocument } from '../protobuf.js';
import {
  optionalBoolean,
  optionalString,
  requireString,
} from './_helpers.js';

const KEY_PATTERN = /^users\/([^/]+)\/categories\/([^/]+)$/;
const ENTITY_KIND = 'Category';

function parseKey(key: string): { userId: string; categoryId: string } {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new CopilotMoneyError(
      'CACHE_DECODE_ERROR',
      `Bad category key: ${key}`
    );
  }
  return { userId: match[1], categoryId: match[2] };
}

export function decodeCategory(key: string, doc: FirestoreDocument): Category {
  const { categoryId } = parseKey(key);
  const f = doc.fields;

  const name = requireString(f, 'name', ENTITY_KIND, categoryId);
  const colorName = requireString(f, 'color', ENTITY_KIND, categoryId);

  const emoji = optionalString(f, 'emoji');
  const icon: CategoryIcon | null =
    emoji && emoji.length > 0 ? { unicode: emoji } : null;

  // `auto_delete_lock` is the "user may not delete this" flag. Absent means
  // the category is user-created and therefore deletable.
  const autoDeleteLock = optionalBoolean(f, 'auto_delete_lock') ?? false;

  return {
    id: categoryId,
    name,
    colorName,
    icon,
    templateId: null,
    isExcluded: optionalBoolean(f, 'excluded') ?? false,
    isRolloverDisabled: false,
    canBeDeleted: !autoDeleteLock,
    childCategories: [],
  };
}
