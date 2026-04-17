# Firestore LevelDB Format Research (2026-04-17)

## Cache location

- macOS: `~/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/__FIRAPP_DEFAULT/copilot-production-22904/main`

The directory contains standard LevelDB files (`*.ldb`, `*.log`, `CURRENT`, `LOCK`, `LOG`, `MANIFEST-*`).

## Lock behavior

Copilot Money holds an exclusive file lock on the LevelDB directory while the app is running. Implementations MUST copy the cache to a tempdir before opening, or ensure the app is closed. See the reference MCP's `CacheReader.copyDatabaseToTmp` for the canonical copy-then-open pattern. Recommendation: always copy to tempdir, regardless of whether the app appears to be running — it removes a lock-contention failure mode entirely, and a plain `cp -R` of the cache directory was observed to succeed even with the app running during this research.

## Library choices

- LevelDB: `classic-level` ^3.0.0 — opened with `{ keyEncoding: 'buffer', valueEncoding: 'buffer' }`.
- Protobuf: hand-written wire-format parser. `protobufjs` is NOT used by the reference MCP (listed in its `package.json` but not imported from any file under `src/`). Task 12 should write a small varint/wire-type parser targeting only the fields we need, not ship `protobufjs`. Task 2's `npm install` list should be just `classic-level`.

## LevelDB key structure

Keys are binary. Observed markers (verified against the user's cache):

- `\x85` — key-type tag prefix (first byte of every key observed)
- `\x00\x01` — path segment separator
- `\x8e` — collection/label marker (leading collection segment)
- `\xbe` — string-segment marker (collection names and document IDs inside a path)
- `\x8b` — raw-string marker (used inside `query_target` keys)
- `\x8c` — two-byte integer / target-id marker (inside `target`, `target_document`, `document_target` keys)
- `\x90` — 12-byte read-time marker (inside `remote_document_read_time` keys)
- `\x80` — end-of-key marker

### Key-type prefixes observed in this cache

All 9 key types observed, total 53,334 keys:

| Prefix (after `\x85`) | Purpose | Decode as document? |
|---|---|---|
| `remote_document` | A cached Firestore document. Value is `MaybeDocument` protobuf. | **Yes** |
| `remote_document_read_time` | Per-document read-time index | No — skip |
| `collection_parent` | Collection-parent index | No — skip |
| `target` | Query/listen target metadata | No — skip |
| `target_global` | Global target metadata (1 key) | No — skip |
| `target_document` | Target → document index | No — skip |
| `document_target` | Document → target index | No — skip |
| `query_target` | Named query → target index | No — skip |
| `version` | Schema version marker (1 key) | No — skip |

Only `remote_document` keys carry entity data. The reference MCP additionally mentions `mutation_queue` in its list — we did NOT observe that prefix in this user's cache but should still defensively skip it, plus any future unknown prefix.

### Example keys observed in the user's cache (IDs redacted)

Each key is shown as `hex | escaped-latin1`. Real document IDs are replaced with `USER_1`, `ITEM_1`, `ACCT_1`, `TXN_1`, etc. Binary structure (markers, separators, lengths) is preserved verbatim.

```
-- remote_document (transactions, nested under items/accounts)
\x85remote_document\x00\x01\xbeitems\x00\x01\xbeITEM_1\x00\x01\xbeaccounts\x00\x01\xbeACCT_1\x00\x01\xbetransactions\x00\x01\xbeTXN_1\x00\x01\x80

-- remote_document (user-customized account row)
\x85remote_document\x00\x01\xbeitems\x00\x01\xbeITEM_1\x00\x01\xbeaccounts\x00\x01\xbeACCT_1\x00\x01\x80

-- remote_document (categories)
\x85remote_document\x00\x01\xbeusers\x00\x01\xbeUSER_1\x00\x01\xbecategories\x00\x01\xbeCAT_1\x00\x01\x80

-- remote_document (recurring)
\x85remote_document\x00\x01\xbeusers\x00\x01\xbeUSER_1\x00\x01\xberecurring\x00\x01\xbeRECUR_1\x00\x01\x80

-- remote_document (budgets)
\x85remote_document\x00\x01\xbeusers\x00\x01\xbeUSER_1\x00\x01\xbebudgets\x00\x01\xbeBUDGET_1\x00\x01\x80

-- remote_document (user root)
\x85remote_document\x00\x01\xbeusers\x00\x01\xbeUSER_1\x00\x01\x80

-- remote_document (item root)
\x85remote_document\x00\x01\xbeitems\x00\x01\xbeITEM_1\x00\x01\x80

-- collection_parent (index entry — skip)
\x85collection_parent\x00\x01\x8eaccounts\x00\x01\xbeitems\x00\x01\xbeITEM_1\x00\x01\x80

-- remote_document_read_time (index entry — skip; \x90 prefixes a 12-byte timestamp)
\x85remote_document_read_time\x00\x01\xbeamazon\x00\x01\xbeUSER_1\x00\x01\xbeorders\x00\x01\x90\xf8i\xe2w\xd8\xf89\x9c\xbf\xb0\x8fORDER_1\x00\x01\x80

-- target (index entry — skip; \x8c prefixes a 2-byte target id)
\x85target\x00\x01\x8c\x82\x80

-- target_global (skip — 1 such key in cache)
\x85target_global\x00\x01\x80

-- target_document (skip)
\x85target_document\x00\x01\x8c\x82\xbeamazon\x00\x01\xbeUSER_1\x00\x01\xbeorders\x00\x01\xbeORDER_1\x00\x01\x80

-- document_target (skip)
\x85document_target\x00\x01\xbeamazon\x00\x01\xbeUSER_1\x00\x01\xbeorders\x00\x01\xbeORDER_1\x00\x01\x8c\x80\x80

-- query_target (skip; note \x8b prefixes a single encoded-query string)
\x85query_target\x00\x01\x8bchanges/USER_1/t|f:time>time(1776449499,333425000)typein[update,delete]|ob:timeasc__name__asc\x00\x01\x8c\xc1\x12\x80

-- version (skip)
\x85version\x00\x01\x80
```

### Parsing rule for `remote_document` keys

After the `\x85remote_document\x00\x01` prefix, the key is a repeating sequence of `\xbe<ascii-segment>\x00\x01` groups, terminated by `\x80`. Segments alternate between collection names (odd positions starting at 1) and document IDs (even positions). The full Firestore document path is formed by joining segments with `/`. The last segment is the document ID; everything before it is the collection path.

## Value protobuf schema

Values are wire-encoded `MaybeDocument` (internal Firestore SDK wrapper — no public `.proto`, reverse-engineered by the reference MCP):

```
message MaybeDocument {
  oneof document_type {
    NoDocument no_document = 1;
    Document   document    = 2;  // google.firestore.v1.Document
  }
}
```

A transaction value observed in this cache begins with `0x12 0xc3 0x11` — tag 2 / wire-type 2 (LEN), length 0x0891 = 2193 bytes — i.e. an embedded `Document` message. Immediately inside, field 1 decodes to the string `projects/copilot-production-22904/databases/(default)/documents/items/ITEM_1/accounts/ACCT_1/transactions/TXN_1`, which confirms the `Document.name` field layout.

The inner `google.firestore.v1.Document` has:

- field 1: `name` (string) — full document path
- field 2: `fields` (map&lt;string, Value&gt;) — the user-facing data
- field 3: `create_time` (Timestamp)
- field 4: `update_time` (Timestamp)

`Value` is the oneof defined at `google/firestore/v1/document.proto` with variants: `null_value`, `boolean_value`, `integer_value`, `double_value`, `timestamp_value`, `string_value`, `bytes_value`, `reference_value`, `geo_point_value`, `array_value` (→ `ArrayValue`), `map_value` (→ `MapValue`).

Task 12 must implement a wire-format decoder that handles all these variants (plus varints, ZigZag where relevant, LEN, and I64/I32 groups as needed for doubles and fixed32/64).

## Entity key prefixes (Firestore collection paths in THIS user's cache)

The document's collection path segment identifies the entity. Route by the collection path as observed below. **Note**: these paths differ from the reference MCP's earlier "top-level `transactions`, `accounts`, `recurring`, `budgets`" description — in this real cache, every user-owned entity is nested. Decoders must match the actual paths, not the generic collection name alone.

| Entity          | Firestore path pattern                                      | Count in this cache | Notes |
|---|---|---|---|
| Transactions    | `items/{item_id}/accounts/{account_id}/transactions/{txn_id}` | 289 | No top-level `transactions` collection; transactions are subcollections of each account |
| Accounts        | `items/{item_id}/accounts/{account_id}`                      | 25  | Plaid-item-scoped account documents; also serves as the canonical account record. No top-level `accounts` |
| Categories      | `users/{user_id}/categories/{category_id}`                   | 24  | User-defined categories |
| Tags            | `users/{user_id}/tags/{tag_id}`                              | 0   | **Not present in this cache** — user has no tags, or Copilot provisions the collection lazily on first use. Decoder should accept zero results gracefully |
| Recurring       | `users/{user_id}/recurring/{recurring_id}`                   | 51  | Under user, not top-level |
| Budgets         | `users/{user_id}/budgets/{budget_id}`                        | 26  | Under user, not top-level |

Out-of-scope for Phase 1 (informational — may be useful in a later phase):

| Path pattern | Count | Notes |
|---|---|---|
| `items/{id}/accounts/{id}/balance_history/{id}` | 8,479 | Largest group by far |
| `investment_performance/{id}/twr_holding/{id}`  | 1,024 | |
| `items/{id}/accounts/{id}/holdings_history/{id}/history/{id}` | 242 | |
| `investment_prices/{id}/daily/{id}`             | 195   | |
| `investment_prices/{id}/hf/{id}`                | 91    | |
| `amazon/{id}/orders/{id}`                       | 64    | Amazon order linkage |
| `investment_splits/{id}`                        | 16    | |
| `securities/{id}`                               | 16    | |
| `investment_performance/{id}`                   | 10    | |
| `items/{id}`                                    | 8     | Plaid items root |
| `feature_tracking/{id}`, `invites/{id}`, `subscriptions/{id}`, `support/{id}`, `user_items/{id}`, `users/{id}`, `users/{id}/announcements/{id}` | 1 each | |

Not in this cache but listed by the reference MCP for completeness: `financial_goals`, `financial_goal_history`, `changes`.

## Open questions for downstream tasks

- Task 11 (`localstore/leveldb.ts`): always copy-to-tempdir, regardless of whether the app is running. Simplest, removes a lock-contention failure mode entirely. `cp -R` of the live cache succeeded during this research.
- Task 12 (`localstore/protobuf.ts`): hand-write a minimal wire-format parser in TypeScript. Do NOT add `protobufjs` as a dependency. Task 2's `npm install` list should be just `classic-level`.
- Task 13 (`decoders/accounts.ts`): path is `items/{item_id}/accounts/{account_id}`, NOT top-level `accounts`. The reference MCP's phrasing ("user customizations at `users/{uid}/accounts`; Plaid details at `items/{item_id}/accounts/{account_id}`") does not match what Firestore actually caches for this user — there is no `users/{uid}/accounts` subcollection in the cache. Decoder should parse only `items/{item_id}/accounts/{account_id}` and expect all the account fields the tool needs to be present there.
- Task 15 (`decoders/tags.ts`): this user's cache has zero `users/{uid}/tags/...` documents. Decoder and the `get_tags` migration (Task 22) must handle the empty-collection case gracefully. Verify the path with a user that has tags before releasing.
- Task 16 (`decoders/transactions.ts`): path is `items/{item_id}/accounts/{account_id}/transactions/{txn_id}`. Iterate over all `items/*/accounts/*/transactions/*` to build the flat transaction list.
- Tasks 13–18 (decoders): field names inside `Document.fields` are set by Copilot's app. Verify each by decoding a sample and logging `Object.keys(doc.fields)` before writing each decoder — the public Firestore SDK gives us `MapValue`; Copilot's app-level schema for individual entities is not documented anywhere public.
- A Firestore document value for a single transaction in this cache is 2,246 bytes. With 289 transactions observed, transactions alone are ~650 KB — a full read-and-decode of all user-owned entities is cheap.

## References

- Reference MCP source: https://github.com/ignaciohermosillacornejo/copilot-money-mcp
- `google/firestore/v1/document.proto`: https://github.com/googleapis/googleapis/blob/master/google/firestore/v1/document.proto
- Firestore SDK internal `MaybeDocument` (no public `.proto`; reverse-engineered by the reference MCP)
