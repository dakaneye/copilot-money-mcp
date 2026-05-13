import { z } from 'zod';
import type { LocalStore } from '../localstore/index.js';
import type { Tag } from '../types/index.js';

export const getTagsInputSchema = z.object({});

export type GetTagsInput = z.infer<typeof getTagsInputSchema>;

export async function getTags(store: LocalStore): Promise<Tag[]> {
  return store.getTags();
}

export function buildTagMap(tags: Tag[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    map.set(tag.name.toLowerCase(), tag.id);
  }
  return map;
}
