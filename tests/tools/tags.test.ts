import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getTags, buildTagMap } from '../../src/tools/tags.js';
import type { LocalStore } from '../../src/localstore/index.js';
import type { Tag } from '../../src/types/index.js';
import { CopilotMoneyError } from '../../src/types/error.js';

function mockLocalStore(tags: Tag[]): LocalStore {
  return {
    getAccounts: mock.fn(async () => []),
    getCategories: mock.fn(async () => []),
    getTags: mock.fn(async () => tags),
    getTransactions: mock.fn(async () => []),
    getRecurring: mock.fn(async () => []),
    getBudgets: mock.fn(async () => []),
    getCacheStatus: mock.fn(async () => ({
      cacheLocation: '/fake',
      entities: {
        accounts: { count: 0, lastUpdatedAt: null },
        categories: { count: 0, lastUpdatedAt: null },
        tags: { count: tags.length, lastUpdatedAt: null },
        transactions: { count: 0, lastUpdatedAt: null },
        recurring: { count: 0, lastUpdatedAt: null },
        budgets: { count: 0, lastUpdatedAt: null },
      },
      totalSizeBytes: 0,
    })),
    close: mock.fn(async () => {}),
  } as unknown as LocalStore;
}

function tag(partial: Partial<Tag> = {}): Tag {
  return {
    id: 'tag_001',
    name: 'business',
    colorName: 'blue',
    ...partial,
  };
}

describe('getTags tool', () => {
  it('returns tags from LocalStore', async () => {
    const store = mockLocalStore([
      tag({ id: 'tag_001', name: 'business' }),
      tag({ id: 'tag_002', name: 'reimbursable' }),
      tag({ id: 'tag_003', name: 'vacation' }),
    ]);

    const result = await getTags(store);

    assert.strictEqual(result.length, 3);
    const ids = result.map((t) => t.id);
    assert.ok(ids.includes('tag_001'));
    assert.ok(ids.includes('tag_002'));
    assert.ok(ids.includes('tag_003'));
  });

  it('returns an empty array when LocalStore has no tags', async () => {
    // The primary user of this MCP has zero tags — this is the common case.
    const store = mockLocalStore([]);

    const result = await getTags(store);

    assert.strictEqual(result.length, 0);
    assert.deepStrictEqual(result, []);
  });

  it('propagates LocalStore errors (LOCAL_CACHE_MISSING)', async () => {
    const store = mockLocalStore([]);
    (
      store.getTags as unknown as {
        mock: { mockImplementation: (fn: () => Promise<Tag[]>) => void };
      }
    ).mock.mockImplementation(async () => {
      throw new CopilotMoneyError('LOCAL_CACHE_MISSING', 'cache missing');
    });

    await assert.rejects(
      () => getTags(store),
      (err: Error) => (err as unknown as { code: string }).code === 'LOCAL_CACHE_MISSING'
    );
  });
});

describe('buildTagMap', () => {
  it('should create lowercase name to id map', () => {
    const tags: Tag[] = [
      tag({ id: 'tag_001', name: 'Business' }),
      tag({ id: 'tag_002', name: 'Reimbursable' }),
    ];

    const map = buildTagMap(tags);

    assert.strictEqual(map.get('business'), 'tag_001');
    assert.strictEqual(map.get('reimbursable'), 'tag_002');
  });

  it('should handle case-insensitive lookups', () => {
    const tags: Tag[] = [tag({ id: 'tag_001', name: 'VACATION' })];

    const map = buildTagMap(tags);

    assert.strictEqual(map.get('vacation'), 'tag_001');
  });

  it('should return empty map for empty input', () => {
    const map = buildTagMap([]);

    assert.strictEqual(map.size, 0);
  });
});
