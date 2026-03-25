// Shared GraphQL fragment definitions

export const TAG_FIELDS = `
fragment TagFields on Tag {
  colorName
  name
  id
}`;

export const GOAL_FIELDS = `
fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode { unicode }
  }
  id
}`;

export const TRANSACTION_FIELDS = `
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

export const ACCOUNT_FIELDS = `
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

export const CATEGORY_FIELDS = `
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

export const SPEND_FIELDS = `
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

export const BUDGET_FIELDS = `
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

export const RECURRING_FIELDS = `
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
