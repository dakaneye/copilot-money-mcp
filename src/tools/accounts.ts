import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { ACCOUNTS_QUERY } from '../graphql/queries.js';
import type { Account, AccountType } from '../types/index.js';

export const getAccountsInputSchema = z.object({
  type: z.enum(['checking', 'savings', 'credit', 'investment', 'loan', 'other'])
    .optional()
    .describe('Filter by account type'),
});

export type GetAccountsInput = z.infer<typeof getAccountsInputSchema>;

interface AccountsResponse {
  accounts: Account[];
}

export async function getAccounts(
  client: GraphQLClient,
  input: GetAccountsInput
): Promise<Account[]> {
  const response = await client.query<AccountsResponse>(
    'Accounts',
    ACCOUNTS_QUERY,
    { filter: null }
  );

  let accounts = response.accounts.filter(
    (a) => !a.isUserHidden && !a.isUserClosed
  );

  if (input.type) {
    accounts = accounts.filter((a) => a.type === input.type);
  }

  return accounts;
}
