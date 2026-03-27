# Copilot Money Authentication Research

> This document captures prior art and public resources related to Copilot Money authentication and API access. Created during auth redesign brainstorming (March 2026).

## Related Projects

### 1. copilot-money-cli (JaviSoto)

**URL:** https://github.com/JaviSoto/copilot-money-cli

A Rust CLI for Copilot Money with Python/Playwright browser helper.

**Authentication approaches:**
- Interactive mode: Opens browser via Playwright
- Email-link mode: User pastes magic link (SSH-friendly)
- Credentials mode: Not recommended

**Key insight - Session persistence:**
> The `--persist-session` flag stores a Playwright browser session under `~/.config/copilot-money-cli/playwright-session` enabling token refresh without re-authentication.

This is different from capturing a token - they persist the entire browser session state so Playwright can refresh tokens by replaying the authenticated session.

**Commands:**
- `copilot auth login --mode interactive`
- `copilot auth login --mode email-link --email you@example.com`
- `copilot auth status`
- `copilot auth refresh` - refreshes from persisted session

---

### 2. copilot-money-mcp (ignaciohermosillacornejo)

**URL:** https://github.com/ignaciohermosillacornejo/copilot-money-mcp

A completely different approach - reads from local Firestore cache instead of API.

**How it works:**
- Reads LevelDB files from `~/Library/Containers/com.copilot.production/Data/Library/Application Support/firestore/`
- Decodes Protocol Buffers to extract cached financial data
- **No authentication required** - operates entirely offline

**Limitations:**
- Only ~500 recent transactions (whatever is cached locally)
- Read-only (cannot categorize, tag, or review transactions)
- Requires macOS desktop app to be installed and synced

**Key insight:**
> Firebase/Firestore's App Check security prevents direct cloud access, which is why this approach reads local cache instead.

---

## Copilot Money Official Resources

### Help Center
- **Home:** https://help.copilot.money/en/
- **Privacy & Security:** https://help.copilot.money/en/articles/9981768-privacy-and-security
- **API Key Instructions:** https://help.copilot.money/en/collections/12267084-api-key-instructions (for crypto exchange connections, not developer API)

### Security Features (from Help Center)
- 2FA via authenticator apps (Google Authenticator)
- Face ID / Touch ID for app unlock (iOS/macOS)
- Global sign-out option
- 256-bit encryption at rest
- TLS in transit
- Partners with Plaid/Finicity for bank connections

### Key Finding: No Public API
Copilot Money does not offer a public developer API. All third-party tools reverse-engineer the web app's GraphQL endpoint or read local cache.

---

## Technical Details

### GraphQL Endpoints
- `https://app.copilot.money/api/graphql` (used by copilot-mcp)
- `https://api.copilot.money/graphql` (used by copilot-overlay)

Both appear to accept the same Firebase ID tokens.

### Authentication Flow (observed)
1. User logs into Copilot Money web app
2. Firebase handles authentication (email/password, magic link, or social)
3. Firebase ID token issued (1-hour expiry)
4. Token used as Bearer token for GraphQL API

### Firebase Project
- Copilot Money uses Firebase Authentication
- Firebase iOS SDK fork exists at: https://github.com/copilotmoney (confirms Firebase usage)

**Firebase Config (extracted from web app JS bundle, March 2026):**
```javascript
{
  apiKey: 'AIzaSyAMgjkeOSkHj4J4rlswOkD16N3WQOoNPpk',
  authDomain: 'copilot-production-22904.firebaseapp.com',
  projectId: 'copilot-production-22904',
}
```

### Firebase App Check (IMPORTANT)

Copilot Money uses **Firebase App Check** to protect their API. This blocks direct Firebase SDK usage from scripts/CLIs:

```
Error: auth/firebase-app-check-token-is-invalid
```

**Implications:**
- Cannot use Firebase SDK directly to check sign-in methods
- Cannot use Firebase SDK directly to set passwords via `updatePassword()`
- Must go through the web app UI (Playwright) or use tokens captured from authenticated sessions
- This is why ignaciohermosillacornejo's MCP reads local cache instead of calling APIs

### Token Lifetime
- Firebase ID tokens: 1 hour
- Firebase refresh tokens: Long-lived (until password change or explicit revocation)
- Current implementations don't capture/use refresh tokens

---

## Authentication Approaches Comparison

| Approach | Used By | Pros | Cons |
|----------|---------|------|------|
| Playwright token capture | copilot-mcp, copilot-overlay | Simple, captures working token | 1-hour expiry, popup UX |
| Playwright session persistence | copilot-money-cli | Can refresh without re-auth | Heavyweight (stores full browser state) |
| Email magic link | copilot-mcp (fallback) | No browser dependency | Clunky UX, manual steps |
| Local Firestore cache | ignaciohermosillacornejo/copilot-money-mcp | No auth needed, fully offline | Read-only, limited data |

---

## Investigated: Password-Based Auth

**Goal:** Enable password login to avoid magic links and Playwright popups.

**From Copilot Help Center:**
> Copilot currently uses a magic link system to help increase the security strength for logging in. If you'd rather set a password, please reach out to them via the in-app chat.

**Attempted self-service password setup:**
- Firebase supports adding password via `updatePassword()` after email-link sign-in
- This would add `["emailLink", "password"]` as sign-in methods
- **BLOCKED by App Check** - cannot call Firebase SDK directly without valid App Check token
- Would need to execute `updatePassword()` from within the web app context (Playwright)

**Status:** Contact Copilot support to enable password auth.

---

## BREAKTHROUGH: Automated Password Login via Playwright (March 2026)

**After contacting Copilot support to enable password auth:**

Successfully tested fully automated login flow:
1. Playwright opens Copilot login page
2. Clicks "Continue with email"
3. Enters email, clicks Continue
4. Clicks "Sign in with password instead"
5. Enters password (using `type()` not `fill()` for special chars)
6. Clicks Continue
7. Token captured from GraphQL request intercept

**Test results:**
```
✅ Token captured from GraphQL request!
Token length: 1088
Expires: 2026-03-27T17:54:48.000Z
Time until expiry: 60 minutes
✅ API works! Found 10 categories
```

**Key findings:**
- Password must be enabled by Copilot support (not self-service)
- Playwright bypasses App Check (runs in real browser context)
- Use `type()` instead of `fill()` for passwords with special characters
- Can run headless once credentials are known
- Token expiry confirmed: 60 minutes

**Prototype script:** `scripts/test-playwright-password.ts`

**Chosen approach for auth daemon:**
- Store email + password in macOS keychain (Touch ID protected)
- Run headless Playwright for token refresh
- No user interaction after initial setup

---

## Open Questions (Updated)

1. ~~**Can we capture Firebase refresh tokens?**~~ → Likely no, due to App Check. Need Playwright session persistence approach.
2. ~~**Is there a token exchange endpoint?**~~ → Yes, `loginWithFirebase` mutation exists, but Firebase ID token works directly.
3. **What triggers session invalidation?** - Password change? Manual sign-out? Time-based?
4. **Can Playwright session persistence enable silent refresh?** - copilot-money-cli does this, needs investigation.
5. **Can we set password from within Playwright context?** - Would need to inject `updatePassword()` call while session is active.

---

## References

- Firebase Auth State Persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firebase Session Management: https://firebase.google.com/docs/auth/admin/manage-sessions
- Firebase Token Refresh: https://github.com/firebase/firebase-js-sdk/issues/497
