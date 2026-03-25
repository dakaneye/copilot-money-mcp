import type { Tag } from './tag.js';

export interface Goal {
  id: string;
  name: string;
  icon: { unicode?: string } | null;
}

export interface Transaction {
  id: string;
  itemId: string;
  accountId: string;
  name: string;
  amount: number;
  date: string;
  type: 'credit' | 'debit';
  categoryId: string | null;
  isReviewed: boolean;
  isPending: boolean;
  recurringId: string | null;
  suggestedCategoryIds: string[];
  userNotes: string | null;
  tipAmount: number | null;
  createdAt: string;
  tags: Tag[];
  goal: Goal | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface TransactionsPage {
  transactions: Transaction[];
  pageInfo: PageInfo;
}

export interface TransactionFilter {
  categoryIds?: string[];
  accountIds?: string[];
  tagIds?: string[];
  isReviewed?: boolean;
  isPending?: boolean;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}
