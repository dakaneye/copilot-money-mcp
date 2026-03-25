# Copilot Money MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to read and write data in Copilot Money.

## Features

- **Read operations**: Query transactions, accounts, categories, recurring payments, budgets, and tags
- **Write operations**: Categorize, tag, and review transactions
- **Bulk operations**: Batch categorize, tag, and review multiple transactions
- **Smart suggestions**: AI-powered category suggestions for uncategorized transactions

## Installation

Clone and build locally:

```bash
git clone https://github.com/dakaneye/copilot-money-mcp.git
cd copilot-money-mcp
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "node",
      "args": ["/path/to/copilot-money-mcp/dist/index.js"]
    }
  }
}
```

### Cursor

Add to MCP settings in Cursor preferences.

## Authentication

On first use, the server will:
1. Open your browser to Copilot Money login
2. After authentication, capture the token automatically
3. Store the token securely in macOS Keychain

## Available Tools

### Read Tools
- `get_transactions` - List/search transactions with filters
- `get_accounts` - List all accounts
- `get_categories` - List spending categories
- `get_tags` - List all tags
- `get_recurring` - List recurring transactions/subscriptions
- `get_budgets` - Get budget information

### Write Tools
- `categorize_transaction` - Set category for a transaction
- `tag_transaction` - Add tags to a transaction
- `untag_transaction` - Remove tags from a transaction
- `review_transaction` - Mark as reviewed
- `unreview_transaction` - Mark as not reviewed

### Bulk Tools
- `bulk_categorize` - Categorize multiple transactions
- `bulk_tag` - Tag multiple transactions
- `bulk_review` - Review multiple transactions

### Smart Tools
- `suggest_categories` - Get AI-powered category suggestions

## Development

```bash
npm run build    # Build
npm run test     # Run tests
```

## License

MIT
