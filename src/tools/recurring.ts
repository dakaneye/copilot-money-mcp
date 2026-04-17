import { z } from 'zod';
import type { LocalStore } from '../localstore/index.js';
import type { Recurring } from '../types/index.js';

export const getRecurringInputSchema = z.object({});

export type GetRecurringInput = z.infer<typeof getRecurringInputSchema>;

export async function getRecurring(store: LocalStore): Promise<Recurring[]> {
  return store.getRecurring();
}
