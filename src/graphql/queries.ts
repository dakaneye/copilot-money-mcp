import {
  TRANSACTION_FIELDS,
  ACCOUNT_FIELDS,
  CATEGORY_FIELDS,
  SPEND_FIELDS,
  BUDGET_FIELDS,
  RECURRING_FIELDS,
  TAG_FIELDS,
} from './fragments.js';

export const TRANSACTIONS_QUERY = `
${TRANSACTION_FIELDS}
query Transactions($first: Int, $after: String, $filter: TransactionFilter, $sort: [TransactionSort!]) {
  transactions(first: $first, after: $after, filter: $filter, sort: $sort) {
    edges {
      cursor
      node { ...TransactionFields }
    }
    pageInfo {
      endCursor
      hasNextPage
      hasPreviousPage
      startCursor
    }
  }
}`;

export const ACCOUNTS_QUERY = `
${ACCOUNT_FIELDS}
query Accounts($filter: AccountFilter) {
  accounts(filter: $filter) {
    ...AccountFields
  }
}`;

export const CATEGORIES_QUERY = `
${CATEGORY_FIELDS}
${SPEND_FIELDS}
${BUDGET_FIELDS}
query Categories($spend: Boolean = false, $budget: Boolean = false, $rollovers: Boolean) {
  categories {
    ...CategoryFields
    spend @include(if: $spend) { ...SpendFields }
    budget(isRolloverEnabled: $rollovers) @include(if: $budget) { ...BudgetFields }
    childCategories {
      ...CategoryFields
      spend @include(if: $spend) { ...SpendFields }
      budget(isRolloverEnabled: $rollovers) @include(if: $budget) { ...BudgetFields }
    }
  }
}`;

export const TAGS_QUERY = `
${TAG_FIELDS}
query Tags {
  tags { ...TagFields }
}`;

export const RECURRINGS_QUERY = `
${RECURRING_FIELDS}
query Recurrings($filter: RecurringFilter) {
  recurrings(filter: $filter) {
    ...RecurringFields
    rule { ...RecurringRuleFields }
    payments { ...RecurringPaymentFields }
  }
}`;

export const BUDGETS_QUERY = `
${BUDGET_FIELDS}
query Budgets {
  categoriesTotal {
    budget { ...BudgetFields }
  }
}`;
