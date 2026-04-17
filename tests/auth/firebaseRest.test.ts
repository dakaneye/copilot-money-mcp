import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import {
  COPILOT_FIREBASE_API_KEY,
  parseOobCodeFromUrl,
  sendOobCode,
  signInWithEmailLink,
} from '../../src/auth/firebaseRest.js';

describe('parseOobCodeFromUrl', () => {
  test('extracts oobCode from standard Firebase magic link', () => {
    const url =
      'https://copilot-production-22904.firebaseapp.com/__/auth/action?apiKey=AIzaSy&mode=signIn&oobCode=ABC123&continueUrl=https://app.copilot.money&lang=en';
    assert.strictEqual(parseOobCodeFromUrl(url), 'ABC123');
  });

  test('handles URL with extra whitespace', () => {
    const url = '  https://example.com/__/auth/action?mode=signIn&oobCode=XYZ  ';
    assert.strictEqual(parseOobCodeFromUrl(url), 'XYZ');
  });

  test('throws CopilotMoneyError OOB_CODE_INVALID when oobCode missing', () => {
    const url = 'https://example.com/__/auth/action?mode=signIn';
    assert.throws(
      () => parseOobCodeFromUrl(url),
      (err: Error) =>
        err.name === 'CopilotMoneyError' &&
        (err as unknown as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws OOB_CODE_INVALID when not a URL', () => {
    assert.throws(
      () => parseOobCodeFromUrl('not a url'),
      (err: Error) => (err as unknown as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws OOB_CODE_INVALID when mode is not signIn', () => {
    const url = 'https://example.com/__/auth/action?mode=resetPassword&oobCode=X';
    assert.throws(
      () => parseOobCodeFromUrl(url),
      (err: Error) => (err as unknown as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });
});

describe('sendOobCode', () => {
  test('POSTs to identitytoolkit with EMAIL_SIGNIN body', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ email: 'a@b.com' }), { status: 200 });
    };

    await sendOobCode(
      { email: 'a@b.com', continueUrl: 'https://app.copilot.money' },
      { fetch: fakeFetch }
    );

    assert.ok(
      capturedUrl?.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode')
    );
    assert.ok(capturedUrl?.includes(`key=${COPILOT_FIREBASE_API_KEY}`));
    assert.strictEqual(capturedInit?.method, 'POST');
    const body = JSON.parse(String(capturedInit?.body));
    assert.strictEqual(body.requestType, 'EMAIL_SIGNIN');
    assert.strictEqual(body.email, 'a@b.com');
    assert.strictEqual(body.continueUrl, 'https://app.copilot.money');
  });

  test('throws SEND_OOB_CODE_FAILED on non-2xx', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'QUOTA_EXCEEDED' } }), { status: 429 });
    await assert.rejects(
      () => sendOobCode({ email: 'a@b.com', continueUrl: 'x' }, { fetch: fakeFetch }),
      (err: Error) => (err as unknown as { code: string }).code === 'SEND_OOB_CODE_FAILED'
    );
  });

  test('throws SEND_OOB_CODE_FAILED on network error', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await assert.rejects(
      () => sendOobCode({ email: 'a@b.com', continueUrl: 'x' }, { fetch: fakeFetch }),
      (err: Error) => (err as unknown as { code: string }).code === 'SEND_OOB_CODE_FAILED'
    );
  });
});

describe('signInWithEmailLink', () => {
  function sampleJwt(expSecondsFromNow: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow, sub: 'uid' })
    ).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  test('returns idToken, refreshToken, expiresAt on success', async () => {
    const idToken = sampleJwt(3600);
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          idToken,
          refreshToken: 'REFRESH',
          localId: 'uid',
          email: 'a@b.com',
          expiresIn: '3600',
        }),
        { status: 200 }
      );
    const result = await signInWithEmailLink(
      { email: 'a@b.com', oobCode: 'X' },
      { fetch: fakeFetch }
    );
    assert.strictEqual(result.idToken, idToken);
    assert.strictEqual(result.refreshToken, 'REFRESH');
    assert.strictEqual(result.email, 'a@b.com');
    assert.ok(result.expiresAt > Date.now());
    assert.ok(result.expiresAt < Date.now() + 3601 * 1000);
  });

  test('throws OOB_CODE_INVALID on INVALID_OOB_CODE error', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: 'INVALID_OOB_CODE' } }),
        { status: 400 }
      );
    await assert.rejects(
      () => signInWithEmailLink({ email: 'a@b.com', oobCode: 'X' }, { fetch: fakeFetch }),
      (err: Error) => (err as unknown as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws OOB_CODE_INVALID on EXPIRED_OOB_CODE', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'EXPIRED_OOB_CODE' } }), { status: 400 });
    await assert.rejects(
      () => signInWithEmailLink({ email: 'a@b.com', oobCode: 'X' }, { fetch: fakeFetch }),
      (err: Error) => (err as unknown as { code: string }).code === 'OOB_CODE_INVALID'
    );
  });

  test('throws SEND_OOB_CODE_FAILED on other non-2xx', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'INTERNAL' } }), { status: 500 });
    await assert.rejects(
      () => signInWithEmailLink({ email: 'a@b.com', oobCode: 'X' }, { fetch: fakeFetch }),
      (err: Error) => (err as unknown as { code: string }).code === 'SEND_OOB_CODE_FAILED'
    );
  });
});
