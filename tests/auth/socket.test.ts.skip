import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:net';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SocketClient } from '../../src/auth/socket.js';

describe('SocketClient', () => {
  const testSocketPath = join(tmpdir(), `test-socket-${process.pid}.sock`);
  let server: ReturnType<typeof createServer> | null = null;

  afterEach(async () => {
    if (server) {
      server.close();
      server = null;
    }
    try {
      await unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  test('getToken returns token from daemon', async () => {
    // Set up mock server
    server = createServer((socket) => {
      socket.on('data', (data) => {
        const request = JSON.parse(data.toString());
        if (request.method === 'GET' && request.path === '/token') {
          socket.write(JSON.stringify({
            token: 'test-token-123',
            expiresAt: '2026-03-27T18:00:00.000Z',
          }));
          socket.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      server!.listen(testSocketPath, resolve);
    });

    const client = new SocketClient(testSocketPath);
    const result = await client.getToken();

    assert.strictEqual(result.token, 'test-token-123');
    assert.strictEqual(result.expiresAt, '2026-03-27T18:00:00.000Z');
  });

  test('getToken throws when daemon not running', async () => {
    const client = new SocketClient('/nonexistent/socket.sock');

    await assert.rejects(
      () => client.getToken(),
      /daemon not running/i
    );
  });

  test('isRunning returns false when daemon not running', async () => {
    const client = new SocketClient('/nonexistent/socket.sock');

    const running = await client.isRunning();
    assert.strictEqual(running, false);
  });
});
