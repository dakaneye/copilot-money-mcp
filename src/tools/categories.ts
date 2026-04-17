import { z } from 'zod';
import type { LocalStore } from '../localstore/index.js';
import type { Category } from '../types/index.js';

export const getCategoriesInputSchema = z.object({
  include_spending: z
    .boolean()
    .optional()
    .describe('Include current spending totals (ignored for local-cache reads)'),
});

export type GetCategoriesInput = z.infer<typeof getCategoriesInputSchema>;

export async function getCategories(
  store: LocalStore,
  _input: GetCategoriesInput
): Promise<Category[]> {
  // `include_spending` is a no-op on local-cache reads — spend aggregates live
  // in other Firestore collections that aren't wired into the LocalStore facade
  // (Phase 2 scope). The flag stays on the input schema for forward/backward
  // compatibility but is intentionally ignored here.
  return store.getCategories();
}

export function buildCategoryMap(categories: Category[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cat of categories) {
    map.set(cat.name.toLowerCase(), cat.id);
  }
  return map;
}
