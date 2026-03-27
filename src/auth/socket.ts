import { connect, createServer, Server, Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmod, unlink } from 'node:fs/promises';

export const DEFAULT_SOCKET_PATH = join(homedir(), '.copilot-auth.sock');

export interface TokenResponse {
  token: string;
  expiresAt: string;
}

export interface StatusResponse {
  authenticated: boolean;
  email: string | null;
  expiresAt: string | null;
}

export interface RefreshResponse {
  success: boolean;
  expiresAt: string | null;
  error?: string;
}

export interface SocketRequest {
  method: 'GET' | 'POST';
  path: '/token' | '/status' | '/refresh';
}

export class SocketClient {
  constructor(private socketPath: string = DEFAULT_SOCKET_PATH) {}

  private async request<T>(req: SocketRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath);
      let data = '';

      socket.on('connect', () => {
        socket.write(JSON.stringify(req));
      });

      socket.on('data', (chunk) => {
        data += chunk.toString();
      });

      socket.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response as T);
          }
        } catch {
          reject(new Error(`Invalid response from daemon: ${data}`));
        }
      });

      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
          reject(new Error('Auth daemon not running. Run `copilot-auth login` first.'));
        } else {
          reject(err);
        }
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Daemon request timed out'));
      });
    });
  }

  async getToken(): Promise<TokenResponse> {
    return this.request<TokenResponse>({ method: 'GET', path: '/token' });
  }

  async getStatus(): Promise<StatusResponse> {
    return this.request<StatusResponse>({ method: 'GET', path: '/status' });
  }

  async refresh(): Promise<RefreshResponse> {
    return this.request<RefreshResponse>({ method: 'POST', path: '/refresh' });
  }

  async isRunning(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}

export type RequestHandler = (req: SocketRequest) => Promise<object>;

export class SocketServer {
  private server: Server | null = null;

  constructor(
    private socketPath: string = DEFAULT_SOCKET_PATH,
    private handler: RequestHandler
  ) {}

  async start(): Promise<void> {
    // Remove stale socket file
    try {
      await unlink(this.socketPath);
    } catch {
      // Ignore - may not exist
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        let data = '';

        socket.on('data', (chunk) => {
          data += chunk.toString();
        });

        socket.on('end', async () => {
          try {
            const request = JSON.parse(data) as SocketRequest;
            const response = await this.handler(request);
            socket.write(JSON.stringify(response));
          } catch (err) {
            socket.write(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }));
          }
          socket.end();
        });

        socket.on('error', () => {
          // Client disconnected, ignore
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.socketPath, async () => {
        // Set socket permissions to owner-only (0600)
        await chmod(this.socketPath, 0o600);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      try {
        await unlink(this.socketPath);
      } catch {
        // Ignore
      }
      this.server = null;
    }
  }
}
