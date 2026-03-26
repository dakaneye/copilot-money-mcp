# Copilot Money MCP Server

MCP server providing read/write access to Copilot Money personal finance data.

## Tech Stack

- **Runtime**: Node.js 20+, ESM modules
- **Language**: TypeScript 5.3+
- **Framework**: MCP SDK (@modelcontextprotocol/sdk)
- **Auth**: Firebase auth with Playwright browser capture, keytar for secure token storage
- **API**: GraphQL (Copilot Money's private API)
- **Testing**: Node.js built-in test runner

## Project Structure

```
src/
├── auth/           # Authentication (keytar, Playwright, Firebase)
├── graphql/        # GraphQL client, queries, mutations, fragments
├── tools/          # MCP tool implementations
└── types/          # TypeScript types and error handling
```

## Commands

```bash
npm run build       # Compile TypeScript
npm run dev         # Watch mode
npm test            # Run tests
npm run lint        # ESLint
npm run typecheck   # Type checking only
```

## Quality Gates (Required Before Commit)

**Do not commit or push unless ALL of these pass:**

1. **Build must succeed**: `npm run build`
2. **Lint must pass**: `npm run lint`
3. **Tests must pass**: `npm test`
4. **Security scan must pass**: Review for secrets, injection, OWASP top 10
5. **Spec coverage verified**: New functionality has corresponding tests
6. **Commit hygiene checked**: Focused changes, no unrelated modifications
7. **/review-code must return grade A**: Run code review before finalizing

## Architecture Notes

- Bulk operations fall back to individual mutations when the bulk endpoint rejects older transactions (Copilot Money API limitation)
- Transaction lookups are limited to the 200 most recent transactions
- Categories and tags are cached for 5 minutes to reduce API calls
- Auth tokens are stored securely in the system keychain via keytar

## Known Limitations

- Copilot Money has no official public API; this uses the same GraphQL endpoint as their web app
- Bulk edit endpoint only works for transactions within ~5 days; older ones require individual mutations
- Token expiry requires manual re-login via `copilot-money-mcp login`
