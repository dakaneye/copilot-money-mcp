# Copilot Money Auth Redesign

> Design spec for unified authentication across Copilot Money integrations.

## Problem Statement

Current auth flow has poor UX:
1. **Popup disruption** - Playwright opens visible browser window
2. **Magic link friction** - Requires checking email, copying URL
3. **1-hour token expiry** - Frequent re-authentication
4. **Code duplication** - Auth logic in both copilot-mcp and copilot-overlay repos

## Constraints

- **No public API** - Copilot Money has no developer API; must use web app's GraphQL endpoint
- **Firebase App Check** - Blocks direct SDK/REST API calls; only browser context (Playwright) works
- **Firebase ID token** - 1-hour expiry, no way to extend
- **Password auth** - Requires contacting Copilot support to enable (not self-service)

## Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Interaction                            │
│                                                                  │
│   ┌──────────────────┐                                          │
│   │  copilot-auth    │  CLI for all auth operations             │
│   │  (bin)           │  - login, logout, status, daemon         │
│   └────────┬─────────┘                                          │
│            │                                                     │
└────────────┼─────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Copilot Auth Daemon                           │
│                    (launchd service)                             │
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │   Keychain   │    │  Playwright  │    │ Unix Socket  │     │
│   │   (keytar)   │    │   (headless) │    │   Server     │     │
│   │              │    │              │    │              │     │
│   │ - email      │    │ - password   │    │ - /token     │     │
│   │ - password   │    │   login flow │    │ - /status    │     │
│   │ - token      │    │ - token      │    │ - /refresh   │     │
│   │ - expiry     │    │   capture    │    │              │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                  │
│   Token Lifecycle:                                               │
│   - Check expiry every 5 minutes                                 │
│   - Refresh at 50 minutes (10 min before expiry)                │
│   - Headless Playwright, no user interaction                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
             │
             │ Unix Socket: ~/.copilot-auth.sock
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│                                                                  │
│   ┌──────────────────┐         ┌──────────────────┐            │
│   │ copilot-money-mcp│         │ copilot-overlay  │            │
│   │ (MCP server)     │         │ (browser ext)    │            │
│   │                  │         │                  │            │
│   │ - No CLI         │         │ - Native host    │            │
│   │ - Just serves    │         │ - Shares same    │            │
│   │   MCP tools      │         │   socket         │            │
│   └──────────────────┘         └──────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. copilot-auth CLI

The only user-facing command for auth management.

```bash
copilot-auth login          # Interactive: opens Playwright, user enters email/password
                            # Captures token, stores credentials in keychain
                            # Starts daemon if not running

copilot-auth logout         # Clears keychain credentials and tokens
                            # Stops daemon

copilot-auth status         # Shows: logged in/out, token expiry, daemon status

copilot-auth daemon start   # Starts daemon (also done automatically by login)
copilot-auth daemon stop    # Stops daemon
copilot-auth daemon status  # Daemon health check
```

#### 2. Auth Daemon

A background service that maintains valid tokens.

**Responsibilities:**
- Stores credentials securely in macOS Keychain (Touch ID protected)
- Monitors token expiry
- Proactively refreshes tokens via headless Playwright before expiry
- Serves tokens to clients via Unix socket

**Socket Protocol:**

```
GET /token
Response: { "token": "...", "expiresAt": "2026-03-27T18:00:00Z" }

GET /status
Response: { "authenticated": true, "email": "user@example.com", "expiresAt": "..." }

POST /refresh
Response: { "success": true, "expiresAt": "..." }
```

**Token Refresh Strategy:**
- Check every 5 minutes
- Refresh at 50 minutes into the 60-minute token lifetime
- On failure, retry 3 times with exponential backoff
- If all retries fail, mark as needing re-login

#### 3. copilot-money-mcp (MCP Server)

Simplified to server-only (no CLI commands).

**Startup flow:**
1. Connect to auth daemon socket
2. Request token
3. If daemon not running or no token, fail with helpful error
4. Initialize GraphQL client with token
5. Serve MCP tools

**Token handling:**
- Cache token in memory with 30-second TTL (avoids socket call per API request)
- On cache miss, request from daemon
- If token request fails, return error to Claude with re-auth instructions

#### 4. Keychain Storage

Using `keytar` for secure credential storage:

```
Service: copilot-money-auth
Account: credentials
Value: { "email": "...", "password": "..." }

Service: copilot-money-auth
Account: token
Value: { "token": "...", "expiresAt": "..." }
```

All values encrypted by macOS Keychain with Touch ID protection.

### Login Flow (One-Time Setup)

Initial login requires user interaction because we don't have credentials yet.

```
User runs: copilot-auth login

1. Playwright launches (visible browser, NOT headless)
2. Navigate to https://app.copilot.money
3. Script clicks "Continue with email"
4. User enters email in browser (we don't have it yet)
5. Script clicks Continue
6. Script clicks "Sign in with password instead"
7. User enters password in browser (we don't have it yet)
8. Script clicks Continue
9. Script intercepts GraphQL request, captures Bearer token
10. Script captures credentials from form fields before navigation
11. Store credentials in keychain (for future automated refresh)
12. Store token in keychain
13. Start daemon
14. Close browser
15. Print success message
```

**Why user enters credentials:** On first login, we don't have the email/password. The script handles navigation and button clicks, but the user fills in their credentials. These get stored in keychain for all future automated refreshes.

### Token Refresh Flow (Automated)

```
Daemon timer fires (every 5 minutes)

1. Check token expiry
2. If > 10 minutes remaining, do nothing
3. If <= 10 minutes remaining:
   a. Load credentials from keychain
   b. Launch headless Playwright
   c. Automate full login flow (no user interaction)
   d. Capture new token
   e. Store in keychain
   f. Close browser
4. Serve new token to clients
```

### Package Structure

```
copilot-mcp/
├── src/
│   ├── server.ts           # MCP server entry point (bin: copilot-money-mcp)
│   ├── cli.ts              # Auth CLI entry point (bin: copilot-auth)
│   ├── auth/
│   │   ├── daemon.ts       # Token refresh daemon
│   │   ├── keychain.ts     # Keytar wrapper
│   │   ├── playwright.ts   # Browser automation (password login)
│   │   └── socket.ts       # Unix socket server/client
│   ├── graphql/            # Unchanged
│   └── tools/              # Unchanged
├── package.json
│   "bin": {
│     "copilot-money-mcp": "dist/server.js",
│     "copilot-auth": "dist/cli.js"
│   }
```

### Error Handling

| Scenario | Client Behavior |
|----------|-----------------|
| Daemon not running | MCP server fails startup with: "Run `copilot-auth login` first" |
| Token expired, refresh failed | Daemon logs error, serves stale token until retry succeeds |
| Credentials invalid | Daemon clears token, returns 401 to clients |
| Keychain locked | Prompt user to unlock (Touch ID) |
| Playwright timeout | Retry with backoff, log detailed error |

### Migration Path

1. **Phase 1**: Implement new auth system alongside existing
2. **Phase 2**: Update MCP server to use daemon
3. **Phase 3**: Remove old auth code (`src/auth/email-link.ts`, old login commands)
4. **Phase 4**: Update copilot-overlay to use shared socket

### Security Considerations

- Credentials stored in macOS Keychain (encrypted, Touch ID protected)
- Unix socket has 0600 permissions (owner only)
- No credentials in environment variables or config files
- Playwright runs headless after initial setup
- Token never written to disk outside keychain

### Dependencies

**New:**
- `playwright` (already present)
- `keytar` (already present)

**Removed:**
- Firebase SDK (App Check blocks it anyway)

### User Experience

**Initial setup (once):**
```
$ copilot-auth login
Opening browser for Copilot Money login...
Please enter your email and password in the browser.
[Browser opens, user fills form]
Login successful! Token stored securely.
Auth daemon started.
```

**Daily use:**
```
$ claude
> What's my spending this month?
[MCP server gets token from daemon, makes API call]
Your spending this month is $2,847...
```

**If something goes wrong:**
```
$ copilot-auth status
Status: Token expired
Daemon: Running (attempting refresh)
Last error: Playwright timeout - Copilot login page changed?

$ copilot-auth login
[Re-authenticate to fix]
```

## Appendix: Technical Validation

### Password Login Works
Validated in `scripts/test-playwright-password.ts`:
- Password auth via Playwright successfully captures token
- Token works for GraphQL API (both read and write operations)
- Key detail: use `type()` not `fill()` for password input

### Firebase App Check Blocks Direct API
Validated in `scripts/test-password-rest.ts` and `scripts/test-password-auth.ts`:
- Firebase SDK: `auth/firebase-app-check-token-is-invalid`
- Firebase REST API: Same error
- Conclusion: Browser context (Playwright) is the only viable path

### Token Lifetime
Confirmed 60-minute expiry via JWT payload inspection.
