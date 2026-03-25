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

const ACCOUNT_FIELDS = `
fragment AccountFields on Account {
  hasHistoricalUpdates
  latestBalanceUpdate
  hasLiveBalance
  institutionId
  isUserHidden
  isUserClosed
  liveBalance
  isManual
  balance
  subType
  itemId
  limit
  color
  name
  type
  mask
  id
}`;

const CATEGORY_FIELDS = `
fragment CategoryFields on Category {
  isRolloverDisabled
  canBeDeleted
  isExcluded
  templateId
  colorName
  icon {
    ... on EmojiUnicode { unicode }
  }
  name
  id
}`;

const SPEND_FIELDS = `
fragment SpendMonthlyFields on CategoryMonthlySpent {
  unpaidRecurringAmount
  comparisonAmount
  amount
  month
  id
}
fragment SpendFields on CategorySpend {
  current { ...SpendMonthlyFields }
  histories { ...SpendMonthlyFields }
}`;

const BUDGET_FIELDS = `
fragment BudgetMonthlyFields on CategoryMonthlyBudget {
  unassignedRolloverAmount
  childRolloverAmount
  unassignedAmount
  resolvedAmount
  rolloverAmount
  childAmount
  goalAmount
  amount
  month
  id
}
fragment BudgetFields on CategoryBudget {
  current { ...BudgetMonthlyFields }
  histories { ...BudgetMonthlyFields }
}`;

const RECURRING_FIELDS = `
fragment RecurringFields on Recurring {
  nextPaymentAmount
  nextPaymentDate
  categoryId
  frequency
  emoji
  icon {
    ... on EmojiUnicode { unicode }
  }
  state
  name
  id
}
fragment RecurringRuleFields on RecurringRule {
  nameContains
  minAmount
  maxAmount
  days
}
fragment RecurringPaymentFields on RecurringPayment {
  amount
  isPaid
  date
}`;

// Queries
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
