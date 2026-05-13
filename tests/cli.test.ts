import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { HELP_TEXT, loginFlow, type LoginDeps } from '../src/cli.js';

function makeDeps() {
  const deps = {
    firebaseRest: {
      sendOobCode: mock.fn(async (_p: { email: string; continueUrl: string }) => {}),
      signInWithEmailLink: mock.fn(async (_p: { email: string; oobCode: string }) => ({
        idToken: 'jwt',
        refreshToken: 'r',
        email: 'a@b.com',
        localId: 'u',
        expiresAt: Date.now() + 3600000,
      })),
      parseOobCodeFromUrl: mock.fn((_url: string) => 'CODE'),
    },
    keychain: {
      setToken: mock.fn(
        async (_v: {
          token: string;
          expiresAt: number;
          email: string;
          refreshToken: string;
        }) => {}
      ),
    },
    prompt: mock.fn(async (_q: string) => 'a@b.com'),
    print: mock.fn((_s: string) => {}),
  };
  return deps;
}

describe('loginFlow', () => {
  test('happy path: email -> sendOobCode -> paste URL -> signInWithEmailLink -> keychain', async () => {
    const deps = makeDeps();
    const prompts: string[] = [];
    deps.prompt = mock.fn(async (q: string) => {
      prompts.push(q);
      return prompts.length === 1 ? 'a@b.com' : 'https://link/?oobCode=CODE&mode=signIn';
    });
    const prints: string[] = [];
    deps.print = mock.fn((s: string) => {
      prints.push(s);
    });

    await loginFlow(deps as unknown as LoginDeps);

    assert.strictEqual(deps.firebaseRest.sendOobCode.mock.calls.length, 1);
    assert.strictEqual(deps.firebaseRest.signInWithEmailLink.mock.calls.length, 1);
    assert.strictEqual(deps.keychain.setToken.mock.calls.length, 1);
    assert.ok(prints.some((p) => p.includes('Logged in')));

    const sendArgs = deps.firebaseRest.sendOobCode.mock.calls[0]?.arguments[0];
    assert.strictEqual(sendArgs?.email, 'a@b.com');
    assert.ok(sendArgs?.continueUrl.startsWith('https://'));

    const parseArgs = deps.firebaseRest.parseOobCodeFromUrl.mock.calls[0]?.arguments[0];
    assert.strictEqual(parseArgs, 'https://link/?oobCode=CODE&mode=signIn');

    const signInArgs = deps.firebaseRest.signInWithEmailLink.mock.calls[0]?.arguments[0];
    assert.strictEqual(signInArgs?.email, 'a@b.com');
    assert.strictEqual(signInArgs?.oobCode, 'CODE');

    const setTokenArgs = deps.keychain.setToken.mock.calls[0]?.arguments[0];
    assert.strictEqual(setTokenArgs?.token, 'jwt');
    assert.strictEqual(setTokenArgs?.refreshToken, 'r');
    assert.strictEqual(setTokenArgs?.email, 'a@b.com');
  });

  test('aborts if sendOobCode fails', async () => {
    const deps = makeDeps();
    deps.firebaseRest.sendOobCode = mock.fn(async () => {
      throw new Error('boom');
    });
    deps.firebaseRest.signInWithEmailLink = mock.fn(async () => {
      throw new Error('not called');
    });

    await assert.rejects(() => loginFlow(deps as unknown as LoginDeps));
    assert.strictEqual(deps.firebaseRest.signInWithEmailLink.mock.calls.length, 0);
    assert.strictEqual(deps.keychain.setToken.mock.calls.length, 0);
  });

  test('propagates parseOobCodeFromUrl error without calling signInWithEmailLink', async () => {
    const deps = makeDeps();
    deps.firebaseRest.parseOobCodeFromUrl = mock.fn(() => {
      throw new Error('invalid url');
    });
    deps.firebaseRest.signInWithEmailLink = mock.fn(async () => {
      throw new Error('not called');
    });

    await assert.rejects(() => loginFlow(deps as unknown as LoginDeps), /invalid url/);
    assert.strictEqual(deps.firebaseRest.signInWithEmailLink.mock.calls.length, 0);
    assert.strictEqual(deps.keychain.setToken.mock.calls.length, 0);
  });

  test('trims whitespace from email before sending', async () => {
    const deps = makeDeps();
    deps.prompt = mock.fn(async () => '  a@b.com  ');

    await loginFlow(deps as unknown as LoginDeps);

    const sendArgs = deps.firebaseRest.sendOobCode.mock.calls[0]?.arguments[0];
    assert.strictEqual(sendArgs?.email, 'a@b.com');
  });
});

describe('HELP_TEXT', () => {
  test('lists login, logout, status subcommands', () => {
    assert.match(HELP_TEXT, /\blogin\b/);
    assert.match(HELP_TEXT, /\blogout\b/);
    assert.match(HELP_TEXT, /\bstatus\b/);
  });

  test('does not mention the removed daemon subcommand', () => {
    assert.doesNotMatch(HELP_TEXT, /daemon/i);
  });
});
