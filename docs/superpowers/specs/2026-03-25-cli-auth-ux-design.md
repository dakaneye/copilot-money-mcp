# CLI Auth UX Design

## Problem

The current authentication flow requires users to:
1. Manually open browser DevTools
2. Find a network request with the Authorization header
3. Copy the bearer token
4. Paste it somewhere (currently unclear where)

This is confusing and error-prone. The localhost callback server in `browser.ts` is unused because Copilot Money doesn't support OAuth redirects.

## Constraints

- Copilot Money uses Firebase passwordless auth (magic link to email)
- No OAuth redirect flow available
- Bearer token from browser is required for GraphQL API (read + write)
- Cannot use the local Firestore cache approach (read-only, bad for writes)

## Solution

Add subcommands to `copilot-money-mcp` for explicit auth management:

```
copilot-money-mcp [command]

Commands:
  login     Store authentication token
  logout    Clear stored token
  status    Check token status
  (none)    Run MCP server (default)
```

## Command Details

### login

```
$ copilot-money-mcp login

Opening Copilot Money in your browser...

To get your authentication token:
1. Log in to Copilot Money in your browser
2. Open DevTools (Cmd+Option+I) → Network tab
3. Click any request → Headers → copy "Authorization: Bearer ..." value
4. Paste the token below (without "Bearer " prefix)

Token: <user pastes token>

Token valid for 52 minutes. Stored in keychain.
```

**Behavior:**
- Opens `https://app.copilot.money` in default browser
- Prompts for token via readline
- Parses JWT to extract `exp` claim
- Calculates and displays time until expiry
- Stores token and expiry in macOS Keychain via keytar

### logout

```
$ copilot-money-mcp logout
Token cleared from keychain.
```

**Behavior:**
- Clears `access_token` and `expires_at` from keychain
- Confirms success

### status

```
$ copilot-money-mcp status
Token: valid (expires in 47 minutes)
```

```
$ copilot-money-mcp status
Token: expired (expired 2 hours ago)
```

```
$ copilot-money-mcp status
Token: not configured
```

**Behavior:**
- Reads token from keychain
- If no token: "not configured"
- If token exists: parse expiry, display status

### (no command) - MCP Server

```
$ copilot-money-mcp
Copilot Money MCP server running on stdio
```

**Behavior on missing/expired token:**
- Do NOT auto-launch browser auth
- Print clear error and exit:
  ```
  Error: Not authenticated. Run 'copilot-money-mcp login' to set up authentication.
  ```

## File Changes

### Modify

**src/index.ts**
- Add subcommand routing based on `process.argv[2]`
- Add `runLogin()`: open browser, prompt, validate JWT, store
- Add `runLogout()`: clear keychain
- Add `runStatus()`: check keychain, display status
- Add `parseJwtExpiry(token)`: extract `exp` from JWT, return Date

**src/auth/manager.ts**
- Remove automatic auth flow trigger from `ensureAuthenticated()`
- Throw clear error with instructions instead

**package.json**
- No changes needed (bin entry already correct)

### Remove

**src/auth/browser.ts**
- Delete entirely
- Unused localhost callback server
- readline prompt logic moves to index.ts

**src/auth/index.ts**
- Remove `performBrowserAuth` export

## JWT Parsing

```typescript
function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
```

## Testing

Manual verification:
1. `copilot-money-mcp status` shows "not configured"
2. `copilot-money-mcp login` opens browser, accepts token, shows expiry
3. `copilot-money-mcp status` shows valid token with time remaining
4. MCP server works with stored token
5. `copilot-money-mcp logout` clears token
6. `copilot-money-mcp status` shows "not configured"
7. MCP server without token shows helpful error
