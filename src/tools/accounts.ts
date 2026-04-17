import { z } from 'zod';
import type { LocalStore } from '../localstore/index.js';
import type { Account } from '../types/index.js';

export const getAccountsInputSchema = z.object({
  type: z.enum(['checking', 'savings', 'credit', 'investment', 'loan', 'other'])
    .optional()
    .describe('Filter by account type'),
});

export type GetAccountsInput = z.infer<typeof getAccountsInputSchema>;

export async function getAccounts(
  store: LocalStore,
  input: GetAccountsInput
): Promise<Account[]> {
  const all = await store.getAccounts();
  let accounts = all.filter((a) => !a.isUserHidden && !a.isUserClosed);

  if (input.type) {
    accounts = accounts.filter((a) => a.type === input.type);
  }

  return accounts;
}
