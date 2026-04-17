/**
 * LocalStore facade over Copilot Money's on-disk Firestore LevelDB cache.
 *
 * Routes one cache-wide scan across six entity decoders: accounts, categories,
 * tags, transactions, recurring, budgets. Copies the cache to a tempdir before
 * reading because Copilot holds an exclusive LOCK on the live directory while
 * running (see docs/research/2026-04-17-firestore-leveldb-format.md).
 *
 * Read model:
 *   - `createLocalStore({ path?, reader? })` resolves the real cache path,
 *     copies it to a tempdir, and opens a read-only LevelDB handle.
 *   - On first call to any getter, we scan all `remote_document` keys once,
 *     decode each key's Firestore path, route to the matching decoder, and
 *     cache the decoded entity arrays for subsequent calls.
 *   - `close()` closes the DB and removes the tempdir.
 *
 * Error policy:
 *   - Fatal path errors (cache missing, locked, decode of a full scan fails)
 *     propagate as `CopilotMoneyError`.
 *   - Per-document decode failures are warned-and-skipped — one bad budget
 *     document shouldn't break `getBudgets()`. The full list of skipped keys
 *     is kept on the instance but not exposed yet; logging is via
 *     `console.warn`.
 */

import { existsSync } from 'node:fs';
import { cp, mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Account } from '../types/account.js';
import type { Budget } from '../types/budget.js';
import type { Category } from '../types/category.js';
import type { Recurring } from '../types/recurring.js';
import type { Tag } from '../types/tag.js';
import type { Transaction } from '../types/transaction.js';
import { CopilotMoneyError } from '../types/error.js';

import { decodeAccount } from './decoders/accounts.js';
import { decodeBudget } from './decoders/budgets.js';
import { decodeCategory } from './decoders/categories.js';
import { decodeRecurring } from './decoders/recurring.js';
import { decodeTag } from './decoders/tags.js';
import { decodeTransaction } from './decoders/transactions.js';
import { decodeKeyPath } from './keypath.js';
import { type LevelDbReader, openReadOnly } from './leveldb.js';
import { resolveCachePath } from './path.js';
import { decodeFirestoreDocument, type FirestoreDocument } from './protobuf.js';

/** Transaction filter applied in-memory after decoding. */
export interface TransactionFilter {
  /** ISO date `YYYY-MM-DD`, inclusive lower bound. */
  since?: string;
  /** ISO date `YYYY-MM-DD`, inclusive upper bound. */
  until?: string;
  categoryId?: string;
  tagId?: string;
  accountId?: string;
  /** Default: 200. */
  limit?: number;
}

/**
 * Per-entity summary exposed via `getCacheStatus`. `lastUpdatedAt` is the
 * max `updateTime` across decoded documents of that entity, or `null` when
 * the collection is empty (e.g. tags for a user who has never tagged).
 */
export interface CacheEntityStatus {
  count: number;
  lastUpdatedAt: string | null;
}

/** Summary returned by `LocalStore.getCacheStatus()`. */
export interface CacheStatus {
  /** The REAL Copilot cache path (not the tempdir we copied to). */
  cacheLocation: string;
  entities: {
    accounts: CacheEntityStatus;
    categories: CacheEntityStatus;
    tags: CacheEntityStatus;
    transactions: CacheEntityStatus;
    recurring: CacheEntityStatus;
    budgets: CacheEntityStatus;
  };
  totalSizeBytes: number;
  /**
   * Diagnostic reason the cache is unavailable — populated only by the
   * `cacheMissingStub` used when `createLocalStore` failed at server
   * startup. Real `getCacheStatus` omits this field.
   */
  error?: string | null;
}

/** Default and only public shape of the LocalStore. */
export interface LocalStore {
  getAccounts(): Promise<Account[]>;
  getCategories(): Promise<Category[]>;
  getTags(): Promise<Tag[]>;
  getTransactions(filter?: TransactionFilter): Promise<Transaction[]>;
  getRecurring(): Promise<Recurring[]>;
  getBudgets(): Promise<Budget[]>;
  getCacheStatus(): Promise<CacheStatus>;
  close(): Promise<void>;
}

/**
 * Dependency injection surface. Production code passes `{}` (or no args) and
 * gets the real cache + a fresh tempdir copy. Tests pass `{ reader, cacheLocation }`
 * to skip path resolution and the tempdir copy entirely.
 */
export interface CreateLocalStoreDeps {
  /** Override the real Copilot cache path (e.g. for an explicit install location). */
  path?: string;
  /**
   * Test-only: pre-built reader to use directly. When provided, path resolution
   * and tempdir copy are skipped. `cacheLocation` is required for
   * `getCacheStatus`.
   */
  reader?: LevelDbReader;
  /** Test-only: value to return from `getCacheStatus().cacheLocation` when `reader` is injected. */
  cacheLocation?: string;
}

const DEFAULT_TRANSACTION_LIMIT = 200;

/** Prefix-scan byte sequence: every `remote_document` key starts with `\x85remote_document`. */
const REMOTE_DOCUMENT_PREFIX = Uint8Array.from([
  0x85,
  ...Array.from('remote_document').map((c) => c.charCodeAt(0)),
]);

type EntityKind =
  | 'account'
  | 'category'
  | 'tag'
  | 'transaction'
  | 'recurring'
  | 'budget';

/**
 * Route a decoded entity path to the matching decoder. Returns `null` for
 * paths that don't match any supported entity shape (e.g. `items/ITEM_1`
 * root, `investment_performance/...`, `users/USER_1`).
 */
function classifyPath(path: string): EntityKind | null {
  const segments = path.split('/');
  // items/{item}/accounts/{acct} -> account
  // items/{item}/accounts/{acct}/transactions/{txn} -> transaction
  if (segments[0] === 'items' && segments[2] === 'accounts') {
    if (segments.length === 4) return 'account';
    if (segments.length === 6 && segments[4] === 'transactions') return 'transaction';
    return null;
  }
  if (segments[0] === 'users' && segments.length === 4) {
    switch (segments[2]) {
      case 'categories':
        return 'category';
      case 'tags':
        return 'tag';
      case 'recurring':
        return 'recurring';
      case 'budgets':
        return 'budget';
      default:
        return null;
    }
  }
  return null;
}

/** All entity bins populated by a single cache scan. */
interface DecodedCache {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  recurring: Recurring[];
  budgets: Budget[];
  /** Per-entity max `updateTime` observed during the scan. */
  lastUpdatedAt: Record<EntityKind, string | null>;
}

function emptyDecodedCache(): DecodedCache {
  return {
    accounts: [],
    categories: [],
    tags: [],
    transactions: [],
    recurring: [],
    budgets: [],
    lastUpdatedAt: {
      account: null,
      category: null,
      tag: null,
      transaction: null,
      recurring: null,
      budget: null,
    },
  };
}

/**
 * Compute the total on-disk size of a cache directory. Walks one level deep
 * (Firestore's LevelDB directory is flat — `.ldb`, `.log`, `CURRENT`,
 * `MANIFEST-*`, `LOCK`, `LOG`). Returns 0 if the directory is unreadable.
 */
async function directorySizeBytes(path: string): Promise<number> {
  try {
    const entries = await readdir(path);
    let total = 0;
    await Promise.all(
      entries.map(async (name) => {
        try {
          const s = await stat(join(path, name));
          if (s.isFile()) total += s.size;
        } catch {
          // Race with a log rotation, or a symlink we can't stat — ignore.
        }
      })
    );
    return total;
  } catch {
    return 0;
  }
}

/**
 * Copy the cache directory to a fresh tempdir and return the tempdir path.
 * `fs.cp` is not atomic; if the app is actively writing, a log file might be
 * partially copied. That's acceptable for read-only work: LevelDB's
 * point-in-time guarantees cover the MANIFEST, and we tolerate a dropped
 * trailing log entry.
 */
async function copyCacheToTempdir(realPath: string): Promise<string> {
  const temp = await mkdtemp(join(tmpdir(), 'copilot-mcp-cache-'));
  await cp(realPath, temp, { recursive: true });
  return temp;
}

class LocalStoreImpl implements LocalStore {
  private scanPromise: Promise<DecodedCache> | null = null;

  constructor(
    private readonly reader: LevelDbReader,
    private readonly cacheLocation: string,
    /** Tempdir to delete on `close`; `null` when caller supplied a reader. */
    private readonly tempDir: string | null
  ) {}

  async getAccounts(): Promise<Account[]> {
    const cache = await this.scan();
    return [...cache.accounts].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCategories(): Promise<Category[]> {
    const cache = await this.scan();
    return [...cache.categories].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTags(): Promise<Tag[]> {
    const cache = await this.scan();
    return [...cache.tags].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTransactions(filter: TransactionFilter = {}): Promise<Transaction[]> {
    const cache = await this.scan();
    const limit = filter.limit ?? DEFAULT_TRANSACTION_LIMIT;

    let out = cache.transactions;
    if (filter.since) out = out.filter((t) => t.date >= filter.since!);
    if (filter.until) out = out.filter((t) => t.date <= filter.until!);
    if (filter.categoryId) out = out.filter((t) => t.categoryId === filter.categoryId);
    if (filter.accountId) out = out.filter((t) => t.accountId === filter.accountId);
    if (filter.tagId) {
      const id = filter.tagId;
      out = out.filter((t) => t.tags.some((tag) => tag.id === id));
    }

    // Date descending; stable sort by id for determinism when dates tie.
    const sorted = [...out].sort((a, b) => {
      if (a.date === b.date) return a.id.localeCompare(b.id);
      return a.date < b.date ? 1 : -1;
    });
    return sorted.slice(0, limit);
  }

  async getRecurring(): Promise<Recurring[]> {
    const cache = await this.scan();
    return [...cache.recurring].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getBudgets(): Promise<Budget[]> {
    const cache = await this.scan();
    return [...cache.budgets];
  }

  async getCacheStatus(): Promise<CacheStatus> {
    const [cache, totalSizeBytes] = await Promise.all([
      this.scan(),
      directorySizeBytes(this.cacheLocation),
    ]);
    return {
      cacheLocation: this.cacheLocation,
      entities: {
        accounts: {
          count: cache.accounts.length,
          lastUpdatedAt: cache.lastUpdatedAt.account,
        },
        categories: {
          count: cache.categories.length,
          lastUpdatedAt: cache.lastUpdatedAt.category,
        },
        tags: {
          count: cache.tags.length,
          lastUpdatedAt: cache.lastUpdatedAt.tag,
        },
        transactions: {
          count: cache.transactions.length,
          lastUpdatedAt: cache.lastUpdatedAt.transaction,
        },
        recurring: {
          count: cache.recurring.length,
          lastUpdatedAt: cache.lastUpdatedAt.recurring,
        },
        budgets: {
          count: cache.budgets.length,
          lastUpdatedAt: cache.lastUpdatedAt.budget,
        },
      },
      totalSizeBytes,
    };
  }

  async close(): Promise<void> {
    try {
      await this.reader.close();
    } finally {
      if (this.tempDir) {
        // Best-effort — if removal fails the OS will clean tmpdir eventually.
        await rm(this.tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  /** Scan once and memoize — all getters share the same decoded result. */
  private scan(): Promise<DecodedCache> {
    if (!this.scanPromise) {
      this.scanPromise = this.runScan();
    }
    return this.scanPromise;
  }

  private async runScan(): Promise<DecodedCache> {
    const out = emptyDecodedCache();

    for await (const keyBytes of this.reader.keysWithPrefix(REMOTE_DOCUMENT_PREFIX)) {
      const path = decodeKeyPath(keyBytes);
      if (!path) continue;

      const kind = classifyPath(path);
      if (!kind) continue;

      let valueBytes: Uint8Array | undefined;
      try {
        valueBytes = await this.reader.get(keyBytes);
      } catch (err) {
        console.warn(`LocalStore: failed to read value for ${path}: ${describe(err)}`);
        continue;
      }
      if (!valueBytes) continue;

      let doc: FirestoreDocument;
      try {
        doc = decodeFirestoreDocument(valueBytes);
      } catch (err) {
        // Expected for NoDocument tombstones — don't spam the console, just skip.
        if (!isTombstoneError(err)) {
          console.warn(`LocalStore: failed to decode doc at ${path}: ${describe(err)}`);
        }
        continue;
      }

      try {
        dispatchDoc(out, kind, path, doc);
      } catch (err) {
        console.warn(`LocalStore: failed to decode ${kind} at ${path}: ${describe(err)}`);
        continue;
      }

      if (doc.updateTime) {
        const prev = out.lastUpdatedAt[kind];
        if (!prev || doc.updateTime > prev) {
          out.lastUpdatedAt[kind] = doc.updateTime;
        }
      }
    }

    return out;
  }
}

function dispatchDoc(
  out: DecodedCache,
  kind: EntityKind,
  path: string,
  doc: FirestoreDocument
): void {
  switch (kind) {
    case 'account':
      out.accounts.push(decodeAccount(path, doc));
      return;
    case 'transaction':
      out.transactions.push(decodeTransaction(path, doc));
      return;
    case 'category':
      out.categories.push(decodeCategory(path, doc));
      return;
    case 'tag':
      out.tags.push(decodeTag(path, doc));
      return;
    case 'recurring':
      out.recurring.push(decodeRecurring(path, doc));
      return;
    case 'budget':
      out.budgets.push(decodeBudget(path, doc));
      return;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * `NoDocument` tombstones (field 1 of `MaybeDocument`) are legitimate on-disk
 * entries — `decodeFirestoreDocument` throws with a fixed message when it
 * can't unwrap a `Document`. Treating those as tombstones (skip silently)
 * keeps the scan quiet for caches that contain deletion markers.
 */
function isTombstoneError(err: unknown): boolean {
  if (!(err instanceof CopilotMoneyError)) return false;
  return /contained no Document field/i.test(err.message);
}

/**
 * Build a LocalStore. Production code calls this with no arguments — the
 * store will locate Copilot's cache, copy it to a tempdir, and open it. Tests
 * inject `reader` + `cacheLocation` to skip the filesystem work.
 */
export async function createLocalStore(
  deps: CreateLocalStoreDeps = {}
): Promise<LocalStore> {
  if (deps.reader) {
    const cacheLocation = deps.cacheLocation ?? '<injected reader>';
    return new LocalStoreImpl(deps.reader, cacheLocation, null);
  }

  const realPath = deps.path ?? (await resolveCachePath());
  if (!existsSync(realPath)) {
    throw new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      `Cache path does not exist: ${realPath}`
    );
  }
  const tempPath = await copyCacheToTempdir(realPath);
  try {
    const reader = await openReadOnly(tempPath);
    return new LocalStoreImpl(reader, realPath, tempPath);
  } catch (err) {
    // Clean up the tempdir on open failure so we don't leak one per bad call.
    await rm(tempPath, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

// Internals exposed for tests only.
export { REMOTE_DOCUMENT_PREFIX, classifyPath };
