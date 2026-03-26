# copilot-money-mcp

MCP server for [Copilot Money](https://copilot.money).

> Unofficial integration using Copilot Money's undocumented API. Use at your own risk.

## Setup

```bash
git clone https://github.com/dakaneye/copilot-money-mcp.git
cd copilot-money-mcp
npm install
npm run build

# Install Playwright and login
npx playwright install chromium
node dist/index.js login
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

Restart Claude Desktop.

## Tools

**Read**: `get_transactions`, `get_accounts`, `get_categories`, `get_tags`, `get_recurring`, `get_budgets`

**Write**: `categorize_transaction`, `review_transaction`, `unreview_transaction`, `tag_transaction`, `untag_transaction`

**Bulk**: `bulk_categorize`, `bulk_tag`, `bulk_review`

**Smart**: `suggest_categories`

## License

MIT
