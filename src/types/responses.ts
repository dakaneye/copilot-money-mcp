import type { Transaction, Category } from './index.js';

export interface EditTransactionResponse {
  editTransaction: {
    transaction: Transaction;
  };
}

export interface TransactionsResponse {
  transactions: {
    edges: Array<{ node: Transaction }>;
  };
}

export interface CategoriesResponse {
  categories: Category[];
}
