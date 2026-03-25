# Copilot Money MCP Server - Design Specification

## Overview

An MCP (Model Context Protocol) server that enables AI assistants to read and write data in Copilot Money, a personal finance app. Unlike the existing read-only MCP that reads local cache, this server communicates directly with Copilot Money's GraphQL API, enabling full read/write capabilities.

## Goals

1. **Read operations**: Query transactions, accounts, categories, recurring payments, budgets, and tags
2. **Write operations**: Categorize, tag, and review transactions using existing categories/tags only
3. **Bulk operations**: Batch categorize, tag, and review multiple transactions
4. **Smart suggestions**: AI-powered category suggestions for uncategorized transactions
5. **Learning opportunity**: Build a well-structured MCP from scratch

## Non-Goals

- Creating new categories or tags (only use existing)
- Modifying account information
- Deleting transactions
- Windows/Linux support (macOS only for v1)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Desktop / Cursor                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol (stdio)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    copilot-money-mcp                         │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │  MCP Server   │  │  Tool Handlers │  │  Auth Manager   │  │
│  │  (stdio)      │──│  (read/write)  │──│  (token store)  │  │
│  └───────────────┘  └───────────────┘  └─────────────────┘  │
│                              │                               │
│                     ┌────────┴────────┐                     │
│                     │ GraphQL Client  │                     │
│                     └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Copilot Money GraphQL API                       │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| MCP Server | Protocol communication via stdio, tool registration |
| Tool Handlers | Business logic for each MCP tool |
| Auth Manager | Browser OAuth flow, token storage (macOS Keychain), refresh logic |
| GraphQL Client | Typed queries and mutations, ported from CLI |

### Project Structure

```
copilot-money-mcp/
├── src/
│   ├── index.ts           # Entry point, MCP server setup
│   ├── auth/              # OAuth flow, token management
│   │   ├── index.ts
│   │   ├── browser.ts     # Browser launch, callback server
│   │   └── keychain.ts    # macOS Keychain integration
│   ├── graphql/           # Client, queries, mutations
│   │   ├── client.ts
│   │   ├── queries.ts
│   │   └── mutations.ts
│   ├── tools/             # MCP tool implementations
│   │   ├── read/          # get_transactions, get_accounts, etc.
│   │   ├── write/         # categorize, tag, review
│   │   └── bulk/          # bulk operations, smart suggestions
│   └── types/             # Shared TypeScript types
├── package.json
├── tsconfig.json
└── README.md
```

## Authentication

### Flow

**First run:**
1. User invokes any tool
2. MCP detects no stored token
3. MCP starts local HTTP server on random port (e.g., 54321)
4. MCP opens browser to Copilot Money login
5. User authenticates in browser
6. Copilot Money redirects to `localhost:54321/callback` with auth code
7. MCP exchanges code for access token + refresh token
8. Tokens stored in macOS Keychain via `keytar`
9. Tool execution proceeds

**Subsequent runs:**
1. MCP loads stored token from Keychain
2. If expired, use refresh token to get new access token
3. If refresh fails, re-trigger browser flow

### Security

- Local callback server binds only to `127.0.0.1`
- Callback server shuts down immediately after receiving token
- Tokens never logged or exposed in MCP responses
- State parameter used to prevent CSRF

## MCP Tools

### Read Tools (6)

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_transactions` | List/search transactions | `start_date?`, `end_date?`, `category?`, `merchant?`, `min_amount?`, `max_amount?`, `account?`, `reviewed?`, `limit?` |
| `get_accounts` | List all accounts | `type?` (checking, savings, credit, investment) |
| `get_categories` | List categories with spending totals | `period?` (this_month, last_month, ytd, etc.) |
| `get_recurring` | List recurring transactions/subscriptions | none |
| `get_budgets` | List budgets with progress | `month?` |
| `get_tags` | List all available tags | none |

### Write Tools (5)

| Tool | Description | Parameters |
|------|-------------|------------|
| `categorize_transaction` | Set category on a transaction | `transaction_id`, `category_name` |
| `tag_transaction` | Add tag(s) to a transaction | `transaction_id`, `tag_names[]` |
| `untag_transaction` | Remove tag(s) from a transaction | `transaction_id`, `tag_names[]` |
| `review_transaction` | Mark transaction as reviewed | `transaction_id` |
| `unreview_transaction` | Mark transaction as unreviewed | `transaction_id` |

**Validation:**
- `category_name` must match an existing category
- `tag_names` must all match existing tags
- `transaction_id` validated against API before mutation

### Bulk & Smart Tools (4)

| Tool | Description | Parameters |
|------|-------------|------------|
| `bulk_categorize` | Categorize multiple transactions | `transaction_ids[]`, `category_name` |
| `bulk_tag` | Tag multiple transactions | `transaction_ids[]`, `tag_names[]` |
| `bulk_review` | Mark multiple as reviewed | `transaction_ids[]` |
| `suggest_categories` | AI suggests categories for uncategorized | `limit?` (default 10) |

**How `suggest_categories` works:**
1. Fetches uncategorized transactions
2. Fetches list of existing categories
3. Returns transactions with suggested category based on merchant patterns and similar past transactions
4. Claude presents suggestions to user for approval
5. User confirms, Claude calls `bulk_categorize`

## Error Handling

| Error Type | Handling |
|------------|----------|
| Not authenticated | Return message prompting auth, trigger browser flow |
| Token expired | Attempt silent refresh; if fails, prompt re-auth |
| Invalid category/tag | Return error listing valid options |
| Transaction not found | Return clear error with failed ID |
| Rate limited | Retry with backoff, inform user if persistent |
| Network error | Return error, suggest checking connection |
| Partial bulk failure | Return which succeeded, which failed, and why |

**Error response format:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CATEGORY",
    "message": "Category 'Foo' not found",
    "suggestions": ["Food & Drink", "Food", "Fast Food"]
  }
}
```

## Testing Strategy

| Layer | Approach |
|-------|----------|
| Unit tests | Test each tool handler with mocked GraphQL responses |
| GraphQL client tests | Test query building, response parsing, error handling |
| Auth tests | Test token storage, refresh logic, expiration handling |
| Integration tests | Test full tool flow with recorded API responses |

**Tooling:**
- `node:test` (built-in)
- Mock HTTP responses for GraphQL API
- Fixtures for sample data

**CI:**
- GitHub Actions on push/PR
- Type checking via `tsc --noEmit`
- ESLint for linting

## Implementation Plan

### Phase 1: Project Setup
- Initialize private GitHub repo under `dakaneye`
- Set up TypeScript + Node.js project
- Configure MCP SDK
- Set up testing infrastructure

### Phase 2: Authentication
- Study CLI's auth implementation
- Implement browser OAuth flow
- Implement Keychain token storage
- Implement token refresh logic

### Phase 3: GraphQL Client
- Port GraphQL queries from CLI
- Implement typed client
- Add error handling

### Phase 4: Read Tools
- Implement all 6 read tools
- Add tests for each

### Phase 5: Write Tools
- Implement all 5 write tools
- Add validation logic
- Add tests for each

### Phase 6: Bulk & Smart Tools
- Implement bulk operations
- Implement `suggest_categories` logic
- Add tests

### Phase 7: Polish
- Error message refinement
- Documentation
- README with setup instructions

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3+
- **MCP SDK**: @modelcontextprotocol/sdk
- **HTTP Client**: Native fetch
- **Token Storage**: keytar (macOS Keychain)
- **Testing**: node:test
- **CI**: GitHub Actions

## Repository

- **Location**: github.com/dakaneye/copilot-money-mcp
- **Visibility**: Private

## References

- [Existing read-only MCP](https://github.com/ignaciohermosillacornejo/copilot-money-mcp)
- [Unofficial CLI with write support](https://github.com/JaviSoto/copilot-money-cli)
- [MCP SDK documentation](https://modelcontextprotocol.io)
