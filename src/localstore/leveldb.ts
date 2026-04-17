import { ClassicLevel } from 'classic-level';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { CopilotMoneyError } from '../types/error.js';

/**
 * Read-only view over a Copilot Money LevelDB cache directory.
 *
 * Copilot's real keys are binary (see
 * docs/research/2026-04-17-firestore-leveldb-format.md), so keys are exposed
 * as `Uint8Array`. Callers may pass either `string` or `Uint8Array` prefixes;
 * strings are interpreted as UTF-8 bytes.
 *
 * The underlying database is held open until `close()` resolves. We never
 * call `put`, `del`, or `batch` here — the MCP's write path goes through the
 * GraphQL client. There is no filesystem-level read-only flag in
 * `classic-level`, so the "read-only" guarantee is structural rather than
 * enforced by LevelDB.
 */
export interface LevelDbReader {
  keysWithPrefix(prefix: string | Uint8Array): AsyncIterable<Uint8Array>;
  get(key: string | Uint8Array): Promise<Uint8Array | undefined>;
  close(): Promise<void>;
}

function toBuffer(value: string | Uint8Array): Buffer {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function startsWith(key: Buffer, prefix: Buffer): boolean {
  if (key.length < prefix.length) return false;
  return key.subarray(0, prefix.length).equals(prefix);
}

interface LevelLikeError extends Error {
  code?: string;
  cause?: unknown;
}

function isLevelLikeError(value: unknown): value is LevelLikeError {
  return value instanceof Error;
}

/**
 * Detects whether a `classic-level` open failure was caused by another
 * process (or handle) holding the database's LOCK file. The outer error is
 * always `LEVEL_DATABASE_NOT_OPEN`; the real diagnosis lives in `.cause.code`
 * (`LEVEL_LOCKED`) and/or the cause's message.
 */
function isLockHeldError(err: unknown): boolean {
  if (!isLevelLikeError(err)) return false;
  const cause = err.cause;
  if (isLevelLikeError(cause)) {
    if (cause.code === 'LEVEL_LOCKED') return true;
    if (/already held|lock/i.test(cause.message)) return true;
  }
  return /already held|LEVEL_LOCKED/i.test(err.message);
}

function describeError(err: unknown): string {
  if (!isLevelLikeError(err)) return String(err);
  const causeMessage = isLevelLikeError(err.cause) ? err.cause.message : undefined;
  return causeMessage ? `${err.message}: ${causeMessage}` : err.message;
}

export async function openReadOnly(path: string): Promise<LevelDbReader> {
  if (!existsSync(path)) {
    throw new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      `Cache path does not exist: ${path}`
    );
  }

  const db = new ClassicLevel<Buffer, Buffer>(path, {
    keyEncoding: 'buffer',
    valueEncoding: 'buffer',
  });

  try {
    await db.open();
  } catch (err) {
    if (isLockHeldError(err)) {
      throw new CopilotMoneyError(
        'LOCAL_CACHE_LOCKED',
        'Copilot Money is holding an exclusive lock on its cache. Close the app or copy the cache first.',
        undefined,
        { cause: describeError(err) }
      );
    }
    throw new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      `Cannot open local cache at ${path}: ${describeError(err)}`,
      undefined,
      { cause: describeError(err) }
    );
  }

  return {
    async *keysWithPrefix(prefix: string | Uint8Array): AsyncIterable<Uint8Array> {
      const prefixBuf = toBuffer(prefix);
      // Iterate forward from the prefix and stop as soon as a key no longer
      // starts with it. Keys in LevelDB are byte-sorted, so this yields the
      // exact prefix range without constructing an upper bound.
      for await (const key of db.keys({ gte: prefixBuf })) {
        const buf = Buffer.isBuffer(key) ? key : Buffer.from(key as Uint8Array);
        if (!startsWith(buf, prefixBuf)) break;
        yield buf;
      }
    },

    async get(key: string | Uint8Array): Promise<Uint8Array | undefined> {
      const value = await db.get(toBuffer(key));
      return value ?? undefined;
    },

    close(): Promise<void> {
      return db.close();
    },
  };
}
