import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { BUDGETS_QUERY } from '../graphql/queries.js';
import type { CategoryBudget } from '../types/index.js';

export const getBudgetsInputSchema = z.object({});

export type GetBudgetsInput = z.infer<typeof getBudgetsInputSchema>;

interface BudgetsResponse {
  categoriesTotal: {
    budget: CategoryBudget;
  };
}

export async function getBudgets(client: GraphQLClient): Promise<CategoryBudget> {
  const response = await client.query<BudgetsResponse>(
    'Budgets',
    BUDGETS_QUERY,
    {}
  );

  return response.categoriesTotal.budget;
}
