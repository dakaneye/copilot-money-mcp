import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getCategories, buildCategoryMap, type GetCategoriesInput } from '../../src/tools/categories.js';
import { GraphQLClient } from '../../src/graphql/client.js';
import type { Category } from '../../src/types/index.js';

const fixtures = {
  categories: [
    {
      id: 'cat_001',
      name: 'Food & Drink',
      icon: { unicode: '🍔' },
      colorName: 'orange',
      templateId: null,
      isExcluded: false,
      isRolloverDisabled: false,
      canBeDeleted: true,
      childCategories: [
        {
          id: 'cat_001a',
          name: 'Groceries',
          icon: { unicode: '🛒' },
          colorName: 'green',
          templateId: null,
          isExcluded: false,
          isRolloverDisabled: false,
          canBeDeleted: true,
          childCategories: [],
        },
        {
          id: 'cat_001b',
          name: 'Restaurants',
          icon: { unicode: '🍽️' },
          colorName: 'red',
          templateId: null,
          isExcluded: false,
          isRolloverDisabled: false,
          canBeDeleted: true,
          childCategories: [],
        },
      ],
    },
    {
      id: 'cat_002',
      name: 'Transportation',
      icon: { unicode: '🚗' },
      colorName: 'blue',
      templateId: null,
      isExcluded: false,
      isRolloverDisabled: false,
      canBeDeleted: true,
      childCategories: [],
    },
    {
      id: 'cat_003',
      name: 'Shopping',
      icon: { unicode: '🛍️' },
      colorName: 'purple',
      templateId: null,
      isExcluded: false,
      isRolloverDisabled: false,
      canBeDeleted: true,
      childCategories: [],
    },
  ],
};

describe('getCategories tool', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return flattened categories including children', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetCategoriesInput = {};

    const result = await getCategories(client, input);

    assert.strictEqual(result.length, 5);

    const ids = result.map(c => c.id);
    assert.ok(ids.includes('cat_001'));
    assert.ok(ids.includes('cat_001a'));
    assert.ok(ids.includes('cat_001b'));
    assert.ok(ids.includes('cat_002'));
    assert.ok(ids.includes('cat_003'));
  });

  it('should include child categories in flattened list', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetCategoriesInput = {};

    const result = await getCategories(client, input);

    const groceries = result.find(c => c.name === 'Groceries');
    assert.ok(groceries);
    assert.strictEqual(groceries.id, 'cat_001a');
  });

  it('should handle categories with no children', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    ) as typeof fetch;

    const input: GetCategoriesInput = {};

    const result = await getCategories(client, input);

    const transport = result.find(c => c.name === 'Transportation');
    assert.ok(transport);
    assert.strictEqual(transport.id, 'cat_002');
  });

  it('should pass include_spending to query', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    const fetchMock = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const input: GetCategoriesInput = { include_spending: true };

    await getCategories(client, input);

    const mockCalls = fetchMock.mock.calls as unknown as Array<{ arguments: [string, RequestInit] }>;
    assert.ok(mockCalls.length > 0);
    const callArgs = mockCalls[0].arguments[1];
    const body = JSON.parse(callArgs.body as string);
    assert.strictEqual(body.variables.spend, true);
  });

  it('should default include_spending to false', async () => {
    const client = new GraphQLClient(() => Promise.resolve('fake-token'));

    const fetchMock = mock.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: fixtures
      }), { status: 200 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const input: GetCategoriesInput = {};

    await getCategories(client, input);

    const mockCalls = fetchMock.mock.calls as unknown as Array<{ arguments: [string, RequestInit] }>;
    assert.ok(mockCalls.length > 0);
    const callArgs = mockCalls[0].arguments[1];
    const body = JSON.parse(callArgs.body as string);
    assert.strictEqual(body.variables.spend, false);
  });
});

describe('buildCategoryMap', () => {
  it('should create lowercase name to id map', () => {
    const categories: Category[] = [
      {
        id: 'cat_001',
        name: 'Food & Drink',
        icon: { unicode: '🍔' },
        colorName: 'orange',
        templateId: null,
        isExcluded: false,
        isRolloverDisabled: false,
        canBeDeleted: true,
        childCategories: [],
      },
      {
        id: 'cat_002',
        name: 'Transportation',
        icon: { unicode: '🚗' },
        colorName: 'blue',
        templateId: null,
        isExcluded: false,
        isRolloverDisabled: false,
        canBeDeleted: true,
        childCategories: [],
      },
    ];

    const map = buildCategoryMap(categories);

    assert.strictEqual(map.get('food & drink'), 'cat_001');
    assert.strictEqual(map.get('transportation'), 'cat_002');
  });

  it('should handle case-insensitive lookups', () => {
    const categories: Category[] = [
      {
        id: 'cat_001',
        name: 'GROCERIES',
        icon: { unicode: '🛒' },
        colorName: 'green',
        templateId: null,
        isExcluded: false,
        isRolloverDisabled: false,
        canBeDeleted: true,
        childCategories: [],
      },
    ];

    const map = buildCategoryMap(categories);

    assert.strictEqual(map.get('groceries'), 'cat_001');
  });

  it('should return empty map for empty input', () => {
    const map = buildCategoryMap([]);

    assert.strictEqual(map.size, 0);
  });
});
