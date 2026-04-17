import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseOobCodeFromUrl } from '../../src/auth/firebaseRest.js';

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
