import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { RECURRINGS_QUERY } from '../graphql/queries.js';

export const getRecurringInputSchema = z.object({});

export type GetRecurringInput = z.infer<typeof getRecurringInputSchema>;

export interface Recurring {
  id: string;
  name: string;
  categoryId: string | null;
  frequency: string;
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
  state: string;
  emoji: string | null;
  payments: Array<{
    date: string;
    amount: number;
    isPaid: boolean;
  }>;
}

interface RecurringsResponse {
  recurrings: Recurring[];
}

export async function getRecurring(client: GraphQLClient): Promise<Recurring[]> {
  const response = await client.query<RecurringsResponse>(
    'Recurrings',
    RECURRINGS_QUERY,
    { filter: null }
  );

  return response.recurrings;
}
