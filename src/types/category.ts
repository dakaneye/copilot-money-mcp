export interface CategoryIcon {
  unicode?: string;
}

export interface SpendMonth {
  id: string;
  month: string;
  amount: number;
  comparisonAmount: number | null;
  unpaidRecurringAmount: number | null;
}

export interface CategorySpend {
  current: SpendMonth | null;
  histories: SpendMonth[];
}

export interface BudgetMonth {
  id: string;
  month: string;
  amount: number;
  goalAmount: number | null;
  resolvedAmount: number | null;
  rolloverAmount: number | null;
  childAmount: number | null;
  childRolloverAmount: number | null;
  unassignedAmount: number | null;
  unassignedRolloverAmount: number | null;
}

export interface CategoryBudget {
  current: BudgetMonth | null;
  histories: BudgetMonth[];
}

export interface Category {
  id: string;
  name: string;
  colorName: string;
  icon: CategoryIcon | null;
  templateId: string | null;
  isExcluded: boolean;
  isRolloverDisabled: boolean;
  canBeDeleted: boolean;
  childCategories: Category[];
  spend?: CategorySpend;
  budget?: CategoryBudget;
}
