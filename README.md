# copilot-money-mcp

MCP server for [Copilot Money](https://copilot.money) personal finance app.

> **Disclaimer**: This is an unofficial integration using Copilot Money's undocumented API. Use at your own risk. Not affiliated with Copilot Money.

## Features

- Query transactions with filters (date, category, merchant, amount)
- View accounts, categories, tags, and budgets
- Categorize and tag transactions
- Mark transactions as reviewed
- Bulk operations for efficient workflows
- Category suggestions based on merchant patterns

## Prerequisites

- Node.js 20+
- A [Copilot Money](https://copilot.money) account
- macOS (for Keychain token storage)

## Quick Start

```bash
# Clone and build
git clone https://github.com/dakaneye/copilot-money-mcp.git
cd copilot-money-mcp
npm install
npm run build

# Install Playwright for browser-based auth
npx playwright install chromium

# Login (opens browser, captures token automatically)
node dist/index.js login

# Add to Claude Desktop config
```

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "node",
      "args": ["/absolute/path/to/copilot-money-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The tools will be available immediately.

## Authentication

### Browser Login (Recommended)

```bash
npx playwright install chromium
node dist/index.js login
```

Opens a browser window. Log into Copilot Money normally. The token is captured automatically when you reach the dashboard.

### Email Link Login (Headless/Remote)

For servers without a display, use email-link authentication:

```bash
# Requires Firebase config (one-time setup)
export COPILOT_FIREBASE_API_KEY="your-api-key"
export COPILOT_FIREBASE_PROJECT_ID="your-project-id"

node dist/index.js login
```

To get Firebase config: Open https://app.copilot.money → DevTools (F12) → Search for `apiKey` in Network or Sources.

### Token Storage

Tokens are stored in macOS Keychain (`copilot-money-mcp` service). They persist across restarts until they expire (~1 hour), then you'll need to login again.

## CLI Commands

| Command | Description |
|---------|-------------|
| `copilot-money-mcp` | Run MCP server |
| `copilot-money-mcp login` | Authenticate (browser) |
| `copilot-money-mcp login --no-browser` | Authenticate (email link) |
| `copilot-money-mcp logout` | Clear stored token |
| `copilot-money-mcp status` | Check auth status |

## Available Tools

### Read
- `get_transactions` - Query with filters (date, category, merchant, amount)
- `get_accounts` - List accounts with balances
- `get_categories` - Categories with spending totals
- `get_tags` - User-defined tags
- `get_recurring` - Recurring transactions
- `get_budgets` - Budget limits and spending

### Write
- `categorize_transaction` - Assign category
- `review_transaction` / `unreview_transaction` - Mark reviewed status
- `tag_transaction` / `untag_transaction` - Manage tags

### Bulk
- `bulk_categorize` - Categorize multiple transactions
- `bulk_tag` - Tag multiple transactions
- `bulk_review` - Review multiple transactions

### Suggestions
- `suggest_categories` - Category suggestions for uncategorized transactions

## License

MIT
