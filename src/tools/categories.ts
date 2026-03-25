import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { CATEGORIES_QUERY } from '../graphql/queries.js';
import type { Category } from '../types/index.js';

export const getCategoriesInputSchema = z.object({
  period: z.enum([
    'this_month', 'last_month', 'last_7_days', 'last_30_days',
    'last_90_days', 'ytd', 'this_year', 'last_year'
  ]).optional().describe('Period for spending totals'),
});

export type GetCategoriesInput = z.infer<typeof getCategoriesInputSchema>;

interface CategoriesResponse {
  categories: Category[];
}

export async function getCategories(
  client: GraphQLClient,
  input: GetCategoriesInput
): Promise<Category[]> {
  const includeSpend = !!input.period;

  const response = await client.query<CategoriesResponse>(
    'Categories',
    CATEGORIES_QUERY,
    {
      spend: includeSpend,
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
