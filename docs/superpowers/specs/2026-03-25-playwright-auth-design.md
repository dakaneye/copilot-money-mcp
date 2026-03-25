# Playwright Auth Capture Design

## Problem

The current `login` command requires users to manually copy a bearer token from browser DevTools - confusing and error-prone.

## Solution

Use Playwright to automate browser login and capture the auth token automatically. Fall back to email-link mode if Playwright is unavailable.

## Auth Flows

### Primary: Playwright Automation

```
copilot-money-mcp login
  → Launch Chromium via Playwright (headful)
  → Navigate to https://app.copilot.money
  → User enters email, requests magic link
  → User clicks magic link in email (browser receives it)
  → Playwright intercepts Authorization header from any GraphQL request
  → Store token in keychain
  → Close browser
  → Done
```

**Network interception:** Listen for requests to `app.copilot.money/api/graphql` and capture the `Authorization` header value.

**Session persistence:** Store browser context to `~/.config/copilot-money-mcp/browser-session/` so cookies persist across logins. Enables faster re-auth when token expires.

### Fallback: Email-Link Mode

Triggered when:
- Playwright not installed
- `--no-browser` flag passed
- Playwright launch fails (headless environment)

```
copilot-money-mcp login
  → Prompt: "Enter your Copilot Money email:"
  → Open https://app.copilot.money in default browser
  → Print: "Check your email for the magic link, then paste the full URL here:"
  → User pastes: https://app.copilot.money/...?oobCode=ABC123&...
  → Extract oobCode from URL
  → Call Firebase signInWithEmailLink(email, url)
  → Get ID token from Firebase user
  → Store token in keychain
  → Done
```

## File Changes

### New Files

**src/auth/playwright.ts**
- `captureTokenWithPlaywright()` - launches browser, intercepts token
- `getSessionPath()` - returns `~/.config/copilot-money-mcp/browser-session/`

**src/auth/firebase.ts**
- `signInWithEmailLink(email, magicLinkUrl)` - Firebase SDK auth
- `extractOobCode(url)` - parses oobCode from magic link URL

### Modified Files

**src/index.ts**
- Update `runLogin()` to try Playwright first, fall back to email-link
- Add `--no-browser` flag support

**package.json**
- Add `playwright` as optional dependency
- Add `firebase` dependency

## Dependencies

```json
{
  "dependencies": {
    "firebase": "^10.x"
  },
  "optionalDependencies": {
    "playwright": "^1.x"
  }
}
```

Users run `npx playwright install chromium` on first use if they want browser automation.

## CLI Interface

```
copilot-money-mcp login [options]

Options:
  --no-browser    Skip Playwright, use email-link mode directly

Flow:
  1. Try Playwright (if available and no --no-browser)
  2. Fall back to email-link mode
  3. Store token in keychain
  4. Report success with expiry info
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Playwright not installed | Fall back to email-link mode |
| Browser launch fails | Fall back to email-link mode |
| User closes browser before auth | "Login cancelled" |
| Invalid magic link URL | "Invalid magic link. Please copy the full URL." |
| Firebase auth fails | Show Firebase error message |
| Network timeout | "Login timed out. Please try again." |

## Security

- Tokens stored in macOS Keychain (existing keytar integration)
- Browser session stored locally, not synced
- No credentials stored in plaintext
- Magic link URLs are one-time use (Firebase enforces this)
