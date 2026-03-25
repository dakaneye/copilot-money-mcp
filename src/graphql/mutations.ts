import { TRANSACTION_FIELDS } from './fragments.js';

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
