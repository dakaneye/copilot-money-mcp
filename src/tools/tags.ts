import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { TAGS_QUERY } from '../graphql/queries.js';
import type { Tag } from '../types/index.js';

export const getTagsInputSchema = z.object({});

export type GetTagsInput = z.infer<typeof getTagsInputSchema>;

interface TagsResponse {
  tags: Tag[];
}

export async function getTags(client: GraphQLClient): Promise<Tag[]> {
  const response = await client.query<TagsResponse>(
    'Tags',
    TAGS_QUERY,
    {}
  );

  return response.tags;
}

export function buildTagMap(tags: Tag[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    map.set(tag.name.toLowerCase(), tag.id);
  }
  return map;
}
