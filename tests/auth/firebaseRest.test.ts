import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  COPILOT_FIREBASE_API_KEY,
  parseOobCodeFromUrl,
  sendOobCode,
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
