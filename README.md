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
- Firebase configuration (see Setup)

## Installation

```bash
npm install -g copilot-money-mcp
```

Or clone and build:

```bash
git clone https://github.com/dakaneye/copilot-money-mcp.git
cd copilot-money-mcp
npm install
npm run build
```

## Setup

### 1. Get Firebase Configuration

This server authenticates through Copilot Money's Firebase backend. Extract the config from the web app:

1. Open https://app.copilot.money in your browser
2. Open Developer Tools (F12) → Network tab
3. Look for requests to `firebaseapp.com` or find the config in the page source
4. Note the `apiKey` and `projectId` values

### 2. Set Environment Variables

```bash
export COPILOT_FIREBASE_API_KEY="your-api-key"
export COPILOT_FIREBASE_PROJECT_ID="your-project-id"
```

### 3. Authenticate

```bash
# Browser-based login (recommended)
npx playwright install chromium
copilot-money-mcp login

# Or email-link mode (no browser required)
copilot-money-mcp login --no-browser
```

Tokens are stored securely in macOS Keychain.

### 4. Configure Your MCP Client

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "node",
      "args": ["/path/to/copilot-money-mcp/dist/index.js"],
      "env": {
        "COPILOT_FIREBASE_API_KEY": "your-api-key",
        "COPILOT_FIREBASE_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

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
