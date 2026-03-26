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

## Quality Gates (MANDATORY - NO EXCEPTIONS)

**STOP. Before ANY git commit or push, you MUST complete ALL of these steps. No shortcuts. No "I'll do it after." Do it NOW or don't commit.**

1. `npm run build` - must succeed
2. `npm run lint` - must pass
3. `npm test` - must pass
4. Security review - check for secrets, injection, OWASP top 10
5. Test coverage - new functionality has tests
6. Commit hygiene - focused changes only
7. **`/review-code` - MUST return grade A (126+/140)**

If you commit without completing step 7, you have failed. Run the review. Get the grade. Then commit.

## Architecture Notes

- Transaction lookups are limited to the 200 most recent transactions
- Categories and tags are cached for 5 minutes to reduce API calls
- Auth tokens are stored securely in the system keychain via keytar

## Known Limitations

- Copilot Money has no official public API; this uses the same GraphQL endpoint as their web app
- Token expiry requires manual re-login via `copilot-money-mcp login`
