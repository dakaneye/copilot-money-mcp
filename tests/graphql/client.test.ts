import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { GraphQLClient } from '../../src/graphql/client.js';
import { CopilotMoneyError } from '../../src/types/error.js';

describe('GraphQLClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('query', () => {
    it('should throw on unauthenticated response', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          errors: [{ message: 'Unauthenticated' }]
        }), { status: 200 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'TOKEN_EXPIRED'
          );
        }
      );
    });

    it('should throw on unauthorized response', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          errors: [{ message: 'Unauthorized' }]
        }), { status: 200 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'TOKEN_EXPIRED'
          );
        }
      );
    });

    it('should handle UNAUTHENTICATED extension code', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          errors: [{ message: 'Auth failed', extensions: { code: 'UNAUTHENTICATED' } }]
        }), { status: 200 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'TOKEN_EXPIRED'
          );
        }
      );
    });

    it('should handle 401 response', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 401 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'NOT_AUTHENTICATED'
          );
        }
      );
    });

    it('should handle 403 response', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 403 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'NOT_AUTHENTICATED'
          );
        }
      );
    });

    it('should handle 429 rate limit response', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 429 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'RATE_LIMITED'
          );
        }
      );
    });

    it('should handle other HTTP errors', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({}), {
          status: 500,
          statusText: 'Internal Server Error'
        }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'NETWORK_ERROR'
          );
        }
      );
    });

    it('should throw on GraphQL errors', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          errors: [{ message: 'Field not found' }]
        }), { status: 200 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'GRAPHQL_ERROR' &&
            error.message === 'Field not found'
          );
        }
      );
    });

    it('should throw when response has no data and no errors', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
      ) as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'GRAPHQL_ERROR'
          );
        }
      );
    });

    it('should return data on successful query', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));
      const expectedData = { test: 'value' };

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          data: expectedData
        }), { status: 200 }))
      ) as typeof fetch;

      const result = await client.query('Test', 'query { test }', {});
      assert.deepStrictEqual(result, expectedData);
    });
  });

  describe('mutate', () => {
    it('should return data on successful mutation', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));
      const expectedData = { updateTest: { id: '123' } };

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          data: expectedData
        }), { status: 200 }))
      ) as typeof fetch;

      const result = await client.mutate('UpdateTest', 'mutation { updateTest }', {});
      assert.deepStrictEqual(result, expectedData);
    });
  });

  describe('auth error retry', () => {
    it('should retry with onAuthError callback on 401', async () => {
      let callCount = 0;
      let tokenCallCount = 0;
      const onAuthError = mock.fn(() => {
        callCount++;
        return Promise.resolve('new-token');
      });

      const getToken = mock.fn(() => {
        tokenCallCount++;
        return Promise.resolve(tokenCallCount === 1 ? 'old-token' : 'new-token');
      });

      const client = new GraphQLClient(getToken, onAuthError);

      let fetchCallCount = 0;
      globalThis.fetch = mock.fn(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return new Response(JSON.stringify({}), { status: 401 });
        }
        return new Response(JSON.stringify({
          data: { test: 'value' }
        }), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await client.query('Test', 'query { test }', {});
      assert.deepStrictEqual(result, { test: 'value' });
      assert.strictEqual(onAuthError.mock.callCount(), 1);
    });

    it('should retry with onAuthError callback on unauthenticated error', async () => {
      let callCount = 0;
      const onAuthError = mock.fn(() => {
        callCount++;
        return Promise.resolve('new-token');
      });

      const client = new GraphQLClient(() => Promise.resolve('fake-token'), onAuthError);

      let requestCount = 0;
      globalThis.fetch = mock.fn(async () => {
        requestCount++;
        if (requestCount === 1) {
          return new Response(JSON.stringify({
            errors: [{ message: 'Unauthenticated' }]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          data: { test: 'value' }
        }), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await client.query('Test', 'query { test }', {});
      assert.deepStrictEqual(result, { test: 'value' });
      assert.strictEqual((onAuthError.mock as unknown as { callCount: () => number }).callCount(), 1);
    });

    it('should not retry without onAuthError callback', async () => {
      const client = new GraphQLClient(() => Promise.resolve('fake-token'));

      globalThis.fetch = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          errors: [{ message: 'Unauthenticated' }]
        }), { status: 200 }))
      ) as unknown as typeof fetch;

      await assert.rejects(
        () => client.query('Test', 'query { test }', {}),
        (error: unknown) => {
          return (
            error instanceof CopilotMoneyError &&
            error.code === 'TOKEN_EXPIRED'
          );
        }
      );

      const mockFetch = globalThis.fetch as unknown as { mock: { callCount: () => number } };
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });
  });

  describe('request headers', () => {
    it('should send correct headers', async () => {
      const client = new GraphQLClient(() => Promise.resolve('test-token'));

      const fetchMock = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          data: { test: 'value' }
        }), { status: 200 }))
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await client.query('Test', 'query { test }', { var1: 'value1' });

      const mockData = fetchMock.mock as unknown as { callCount: () => number; calls: Array<{ arguments: unknown[] }> };
      assert.strictEqual(mockData.callCount(), 1);
      const call = mockData.calls[0];
      const requestInit = call.arguments[1] as RequestInit;

      assert.strictEqual(requestInit.method, 'POST');
      assert.ok(requestInit.headers);
      const headers = requestInit.headers as Record<string, string>;
      assert.strictEqual(headers['Content-Type'], 'application/json');
      assert.strictEqual(headers['Authorization'], 'Bearer test-token');
    });

    it('should send correct request body', async () => {
      const client = new GraphQLClient(() => Promise.resolve('test-token'));

      const fetchMock = mock.fn(() =>
        Promise.resolve(new Response(JSON.stringify({
          data: { test: 'value' }
        }), { status: 200 }))
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const query = 'query GetTest { test }';
      const variables = { var1: 'value1' };
      await client.query('Test', query, variables);

      const mockData = fetchMock.mock as unknown as { callCount: () => number; calls: Array<{ arguments: unknown[] }> };
      const call = mockData.calls[0];
      const requestInit = call.arguments[1] as RequestInit;
      const body = JSON.parse(requestInit.body as string);

      assert.strictEqual(body.operationName, 'Test');
      assert.strictEqual(body.query, query);
      assert.deepStrictEqual(body.variables, variables);
    });
  });
});
