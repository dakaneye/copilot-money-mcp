# copilot-money-mcp

[![CI](https://github.com/dakaneye/copilot-money-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/dakaneye/copilot-money-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dakaneye-js/copilot-money-mcp)](https://www.npmjs.com/package/@dakaneye-js/copilot-money-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for [Copilot Money](https://copilot.money).

> Unofficial integration using Copilot Money's undocumented API. Use at your own risk.

## Install

```bash
git clone https://github.com/dakaneye/copilot-money-mcp.git
cd copilot-money-mcp
npm install
npm run build
npm link

# Login (opens browser, captures token)
npx playwright install chromium
copilot-money-mcp login
```

## Configure

**Claude Desktop** - add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "copilot-money": {
      "command": "copilot-money-mcp"
    }
  }
}
```

**Claude Code** - add to `~/.claude/settings.json`:

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
copilot-money-mcp login    # Authenticate (browser)
copilot-money-mcp logout   # Clear stored token
copilot-money-mcp status   # Check auth status
```

## Tools

**Read**: `get_transactions`, `get_accounts`, `get_categories`, `get_tags`, `get_recurring`, `get_budgets`

**Write**: `categorize_transaction`, `review_transaction`, `unreview_transaction`, `tag_transaction`, `untag_transaction`

**Bulk**: `bulk_categorize`, `bulk_tag`, `bulk_review`

**Smart**: `suggest_categories`

## License

MIT
