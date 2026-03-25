import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { CATEGORIES_QUERY } from '../graphql/queries.js';
import type { Category } from '../types/index.js';

export const getCategoriesInputSchema = z.object({
  include_spending: z.boolean().optional().describe('Include current spending totals'),
});

export type GetCategoriesInput = z.infer<typeof getCategoriesInputSchema>;

interface CategoriesResponse {
  categories: Category[];
}

export async function getCategories(
  client: GraphQLClient,
  input: GetCategoriesInput
): Promise<Category[]> {
  const response = await client.query<CategoriesResponse>(
    'Categories',
    CATEGORIES_QUERY,
    {
      spend: input.include_spending ?? false,
      budget: false,
      rollovers: false,
    }
  );

  // Flatten categories including children
  const allCategories: Category[] = [];
  for (const cat of response.categories) {
    allCategories.push(cat);
    if (cat.childCategories) {
      allCategories.push(...cat.childCategories);
    }
  }

  return allCategories;
}

export function buildCategoryMap(categories: Category[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cat of categories) {
    map.set(cat.name.toLowerCase(), cat.id);
  }
  return map;
}
