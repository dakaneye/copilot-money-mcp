// Fragment definitions
const TAG_FIELDS = `
fragment TagFields on Tag {
  colorName
  name
  id
}`;

const GOAL_FIELDS = `
fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode { unicode }
  }
  id
}`;

const TRANSACTION_FIELDS = `
${TAG_FIELDS}
${GOAL_FIELDS}
fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags { ...TagFields }
  goal { ...GoalFields }
}`;

// Mutations
export const EDIT_TRANSACTION_MUTATION = `
${TRANSACTION_FIELDS}
mutation EditTransaction($itemId: ID!, $accountId: ID!, $id: ID!, $input: EditTransactionInput) {
  editTransaction(itemId: $itemId, accountId: $accountId, id: $id, input: $input) {
    transaction { ...TransactionFields }
  }
}`;

export const BULK_EDIT_TRANSACTIONS_MUTATION = `
${TRANSACTION_FIELDS}
mutation BulkEditTransactions($input: BulkEditTransactionInput!, $filter: TransactionFilter) {
  bulkEditTransactions(filter: $filter, input: $input) {
    updated { ...TransactionFields }
    failed {
      transaction { ...TransactionFields }
      error
      errorCode
    }
  }
}`;
