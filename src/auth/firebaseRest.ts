import { Buffer } from 'node:buffer';
import { CopilotMoneyError } from '../types/error.js';

export function parseOobCodeFromUrl(pasted: string): string {
  const trimmed = pasted.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Pasted value is not a valid URL.');
  }
  const mode = url.searchParams.get('mode');
  const oobCode = url.searchParams.get('oobCode');
  if (mode !== 'signIn') {
    throw new CopilotMoneyError(
      'OOB_CODE_INVALID',
      `Expected a sign-in link (mode=signIn), got mode=${mode ?? 'unknown'}.`
    );
  }
  if (!oobCode) {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Sign-in link missing oobCode parameter.');
  }
  return oobCode;
}

export const COPILOT_FIREBASE_API_KEY = 'AIzaSyAMgjkeOSkHj4J4rlswOkD16N3WQOoNPpk';
const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

export interface SendOobCodeParams {
  email: string;
  continueUrl: string;
}

export interface FirebaseRestDeps {
  fetch?: typeof fetch;
}

export async function sendOobCode(
  params: SendOobCodeParams,
  deps: FirebaseRestDeps = {}
): Promise<void> {
  const f = deps.fetch ?? fetch;
  const url = `${IDENTITY_TOOLKIT_BASE}:sendOobCode?key=${COPILOT_FIREBASE_API_KEY}`;
  let resp: Response;
  try {
    resp = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestType: 'EMAIL_SIGNIN',
        email: params.email,
        continueUrl: params.continueUrl,
      }),
    });
  } catch (err) {
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      `Network error sending sign-in email: ${(err as Error).message}`
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      `Copilot rejected the sign-in request (HTTP ${resp.status}). If this persists you may be App-Check-throttled; wait 24h. Body: ${text.slice(0, 200)}`
    );
  }
}

export interface SignInResult {
  idToken: string;
  refreshToken: string;
  email: string;
  localId: string;
  expiresAt: number;
}

function parseJwtExp(token: string): number {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Invalid JWT from Firebase.');
  }
  let payload: { exp?: number };
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { exp?: number };
  } catch {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Invalid JWT payload from Firebase.');
  }
  if (!payload.exp) {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'JWT missing exp claim.');
  }
  return payload.exp * 1000;
}

export async function signInWithEmailLink(
  params: { email: string; oobCode: string },
  deps: FirebaseRestDeps = {}
): Promise<SignInResult> {
  const f = deps.fetch ?? fetch;
  const url = `${IDENTITY_TOOLKIT_BASE}:signInWithEmailLink?key=${COPILOT_FIREBASE_API_KEY}`;
  let resp: Response;
  try {
    resp = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: params.email, oobCode: params.oobCode }),
    });
  } catch (err) {
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      `Network error completing sign-in: ${(err as Error).message}`
    );
  }

  const body = (await resp.json().catch(() => ({}))) as {
    idToken?: string;
    refreshToken?: string;
    localId?: string;
    email?: string;
    error?: { message?: string };
  };

  if (!resp.ok) {
    const msg = body.error?.message ?? `HTTP ${resp.status}`;
    if (msg === 'INVALID_OOB_CODE' || msg === 'EXPIRED_OOB_CODE') {
      throw new CopilotMoneyError(
        'OOB_CODE_INVALID',
        'Sign-in link invalid or expired. Run `copilot-auth login` again to get a new one.'
      );
    }
    throw new CopilotMoneyError('SEND_OOB_CODE_FAILED', `Firebase rejected sign-in: ${msg}`);
  }

  if (!body.idToken || !body.refreshToken || !body.localId || !body.email) {
    throw new CopilotMoneyError(
      'SEND_OOB_CODE_FAILED',
      'Firebase sign-in response missing fields.'
    );
  }

  return {
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    email: body.email,
    localId: body.localId,
    expiresAt: parseJwtExp(body.idToken),
  };
}
