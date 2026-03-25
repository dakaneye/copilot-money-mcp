import { z } from 'zod';
import type { GraphQLClient } from '../graphql/client.js';
import { EDIT_TRANSACTION_MUTATION } from '../graphql/mutations.js';
import type { Transaction } from '../types/index.js';
import type { EditTransactionResponse } from '../types/responses.js';
import { CopilotMoneyError } from '../types/error.js';

export const tagTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
  tag_names: z.array(z.string()).describe('Tag names to add'),
});

export type TagTransactionInput = z.infer<typeof tagTransactionInputSchema>;

export const untagTransactionInputSchema = z.object({
  transaction_id: z.string().describe('The transaction ID'),
  tag_names: z.array(z.string()).describe('Tag names to remove'),
});

export type UntagTransactionInput = z.infer<typeof untagTransactionInputSchema>;

export async function tagTransaction(
  client: GraphQLClient,
  input: TagTransactionInput,
  transaction: Transaction,
  tagMap: Map<string, string>,
  tagNames: string[]
): Promise<Transaction> {
  const tagIds: string[] = [];
  const invalidTags: string[] = [];

  for (const name of input.tag_names) {
    const tagId = tagMap.get(name.toLowerCase());
    if (tagId) {
      tagIds.push(tagId);
    } else {
      invalidTags.push(name);
    }
  }

  if (invalidTags.length > 0) {
    throw new CopilotMoneyError(
      'INVALID_TAG',
      `Tags not found: ${invalidTags.join(', ')}`,
      tagNames.slice(0, 10)
    );
  }

  // Combine existing tags with new ones
  const existingTagIds = transaction.tags.map((t) => t.id);
  const allTagIds = [...new Set([...existingTagIds, ...tagIds])];

  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        tagIds: allTagIds,
      },
    }
  );

  return response.editTransaction.transaction;
}

export async function untagTransaction(
  client: GraphQLClient,
  input: UntagTransactionInput,
  transaction: Transaction,
  tagMap: Map<string, string>
): Promise<Transaction> {
  const tagIdsToRemove = new Set<string>();

  for (const name of input.tag_names) {
    const tagId = tagMap.get(name.toLowerCase());
    if (tagId) {
      tagIdsToRemove.add(tagId);
    }
  }

  const remainingTagIds = transaction.tags
    .filter((t) => !tagIdsToRemove.has(t.id))
    .map((t) => t.id);

  const response = await client.mutate<EditTransactionResponse>(
    'EditTransaction',
    EDIT_TRANSACTION_MUTATION,
    {
      id: transaction.id,
      itemId: transaction.itemId,
      accountId: transaction.accountId,
      input: {
        tagIds: remainingTagIds,
      },
    }
  );

  return response.editTransaction.transaction;
}
