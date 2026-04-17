import { z } from 'zod';
import type { LocalStore } from '../localstore/index.js';
import type { Budget } from '../types/index.js';

export const getBudgetsInputSchema = z.object({});

export type GetBudgetsInput = z.infer<typeof getBudgetsInputSchema>;

export async function getBudgets(store: LocalStore): Promise<Budget[]> {
  return store.getBudgets();
}
