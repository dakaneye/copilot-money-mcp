# copilot-money-mcp

[![CI](https://github.com/dakaneye/copilot-money-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/dakaneye/copilot-money-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dakaneye-js/copilot-money-mcp)](https://www.npmjs.com/package/@dakaneye-js/copilot-money-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for [Copilot Money](https://copilot.money).

> Unofficial integration. Reads come from the local Firestore cache maintained by the Copilot Money Mac app; writes go to Copilot's private GraphQL endpoint. Use at your own risk.

## Prerequisites

- **macOS** — the reader depends on the Copilot Money Mac app's on-disk cache.
- **Copilot Money Mac app** installed and opened at least once. The app populates `~/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/...`, which this server parses for reads. If the app has never run on this machine, reads fail with `LOCAL_CACHE_MISSING`.
- Node.js 20+.

## Install

```bash
npm install -g @dakaneye-js/copilot-money-mcp
```

Then log in to enable write tools (reads don't need auth):

```bash
copilot-auth login
```

The login flow is magic-link-based:

1. Enter your Copilot Money email.
2. Check your inbox for a sign-in email from Copilot.
3. Copy the sign-in URL from the email and paste it back into the terminal.
4. The ID token is stored in the macOS Keychain. Valid for ~60 minutes.

There's no browser automation, no password, and no background daemon. When the token expires, write tools return `TOKEN_EXPIRED` and you re-run `copilot-auth login`.

## Configure

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "copilot-money-mcp"
    }
  }
}
```

**Claude Code** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "copilot-money-mcp"
    }
  }
}
```

## CLI

```bash
copilot-auth login     # Magic-link authentication
copilot-auth logout    # Clear stored credentials and tokens
copilot-auth status    # Show current login and token expiry
```

## Tools

**Read** (from local cache — no network): `get_transactions`, `get_accounts`, `get_categories`, `get_tags`, `get_recurring`, `get_budgets`, `get_cache_status`

**Write** (GraphQL, requires valid token): `categorize_transaction`, `review_transaction`, `unreview_transaction`, `tag_transaction`, `untag_transaction`

**Bulk**: `bulk_categorize`, `bulk_tag`, `bulk_review`

**Smart**: `suggest_categories`

All read responses include `meta.cacheUpdatedAt` so you can tell how fresh the local data is. Use `get_cache_status` to see per-entity counts and last-updated timestamps.

## Troubleshooting

- **`LOCAL_CACHE_MISSING`** — open the Copilot Money Mac app at least once, then retry.
- **`LOCAL_CACHE_LOCKED`** — the Mac app is holding the LevelDB write lock. Quit the app and retry.
- **`TOKEN_EXPIRED` / `NOT_AUTHENTICATED`** — run `copilot-auth login` and paste the sign-in URL.

## License

MIT
