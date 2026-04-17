import { z } from 'zod';
import type { LocalStore } from '../localstore/index.js';
import type { Transaction, Category } from '../types/index.js';

export const suggestCategoriesInputSchema = z.object({
  limit: z.number().optional().default(10).describe('Maximum suggestions to return'),
});

export type SuggestCategoriesInput = z.infer<typeof suggestCategoriesInputSchema>;

export interface CategorySuggestion {
  transaction: Transaction;
  suggestedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export async function suggestCategories(
  store: LocalStore,
  input: SuggestCategoriesInput
): Promise<CategorySuggestion[]> {
  // Fetch a wider window than we need so filtering out categorized/reviewed
  // transactions still leaves enough candidates to satisfy `limit`.
  const [txns, categories] = await Promise.all([
    store.getTransactions({ limit: Math.max(input.limit * 4, 200) }),
    store.getCategories(),
  ]);

  const uncategorized = txns.filter((t) => t.categoryId === null && !t.isReviewed);

  const categoryById = new Map<string, Category>();
  for (const cat of categories) {
    categoryById.set(cat.id, cat);
    for (const child of cat.childCategories || []) {
      categoryById.set(child.id, child);
    }
  }

  const suggestions: CategorySuggestion[] = [];

  for (const txn of uncategorized) {
    if (suggestions.length >= input.limit) break;

    // Use Copilot Money's own suggestions if available
    if (txn.suggestedCategoryIds && txn.suggestedCategoryIds.length > 0) {
      const suggestedId = txn.suggestedCategoryIds[0];
      const category = categoryById.get(suggestedId);
      if (category) {
        suggestions.push({
          transaction: txn,
          suggestedCategory: category.name,
          confidence: 'high',
          reason: 'Suggested by Copilot Money based on transaction history',
        });
        continue;
      }
    }

    // Fallback: pattern matching on merchant name
    const suggestion = matchByMerchantPattern(txn, categories);
    if (suggestion) {
      suggestions.push({
        transaction: txn,
        suggestedCategory: suggestion.name,
        confidence: 'medium',
        reason: `Merchant name "${txn.name}" matches pattern for ${suggestion.name}`,
      });
    }
  }

  return suggestions;
}

function matchByMerchantPattern(
  txn: Transaction,
  categories: Category[]
): Category | null {
  const name = txn.name.toLowerCase();

  const patterns: Array<{ pattern: RegExp; categoryName: string }> = [
    { pattern: /uber|lyft|taxi|ride/i, categoryName: 'Transportation' },
    { pattern: /amazon|target|walmart|costco/i, categoryName: 'Shopping' },
    { pattern: /whole foods|trader joe|grocery|safeway|kroger/i, categoryName: 'Groceries' },
    { pattern: /starbucks|coffee|cafe/i, categoryName: 'Coffee Shops' },
    { pattern: /netflix|spotify|hulu|disney|subscription/i, categoryName: 'Subscriptions' },
    { pattern: /restaurant|doordash|grubhub|uber eats/i, categoryName: 'Restaurants' },
    { pattern: /gas|shell|chevron|exxon|bp/i, categoryName: 'Gas' },
    { pattern: /gym|fitness|peloton/i, categoryName: 'Health & Fitness' },
  ];

  for (const { pattern, categoryName } of patterns) {
    if (pattern.test(name)) {
      const found = categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (found) return found;

      for (const cat of categories) {
        const child = cat.childCategories?.find(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase()
        );
        if (child) return child;
      }
    }
  }

  return null;
}
