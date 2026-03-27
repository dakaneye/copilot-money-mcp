import { SocketServer, SocketRequest, DEFAULT_SOCKET_PATH } from './socket.js';
import {
  getToken,
  storeToken,
  getCredentials,
  clearAll,
  isTokenExpired,
  type StoredToken,
  type StoredCredentials,
} from './keychain.js';
import { automatedLogin } from './playwright.js';

const REFRESH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface DaemonDeps {
  keychain?: {
    getToken: () => Promise<StoredToken | null>;
    storeToken: (token: StoredToken) => Promise<void>;
    getCredentials: () => Promise<StoredCredentials | null>;
    clearAll?: () => Promise<void>;
    isTokenExpired?: (token: StoredToken) => boolean;
  };
  playwright?: {
    automatedLogin: (email: string, password: string) => Promise<{ token: string; expiresAt: number }>;
  };
}

export function createDaemon(deps: DaemonDeps = {}) {
  const keychain = deps.keychain ?? {
    getToken,
    storeToken,
    getCredentials,
    clearAll,
    isTokenExpired,
  };

  const playwright = deps.playwright ?? { automatedLogin };

  let refreshTimer: NodeJS.Timeout | null = null;
  let socketServer: SocketServer | null = null;
  let lastError: string | null = null;

  async function refreshIfNeeded(): Promise<void> {
    const token = await keychain.getToken();

    if (!token) {
      lastError = 'No token stored';
      return;
    }

    const shouldRefresh = keychain.isTokenExpired?.(token) ?? isTokenExpired(token);

    if (!shouldRefresh) {
      lastError = null;
      return;
    }

    const credentials = await keychain.getCredentials();
    if (!credentials) {
      lastError = 'No credentials stored - re-login required';
      return;
    }

    try {
      console.error('[daemon] Token expiring soon, refreshing...');
      const result = await playwright.automatedLogin(credentials.email, credentials.password);
      await keychain.storeToken({ token: result.token, expiresAt: result.expiresAt });
      console.error('[daemon] Token refreshed successfully');
      lastError = null;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown refresh error';
      console.error(`[daemon] Refresh failed: ${lastError}`);
    }
  }

  async function handleRequest(req: SocketRequest): Promise<object> {
    if (req.method === 'GET' && req.path === '/token') {
      const token = await keychain.getToken();
      if (!token) {
        return { error: 'Not authenticated. Run `copilot-auth login` first.' };
      }
      return {
        token: token.token,
        expiresAt: new Date(token.expiresAt).toISOString(),
      };
    }

    if (req.method === 'GET' && req.path === '/status') {
      const token = await keychain.getToken();
      const credentials = await keychain.getCredentials();
      return {
        authenticated: !!token,
        email: credentials?.email ?? null,
        expiresAt: token ? new Date(token.expiresAt).toISOString() : null,
        lastError,
      };
    }

    if (req.method === 'POST' && req.path === '/refresh') {
      try {
        await refreshIfNeeded();
        const token = await keychain.getToken();
        return {
          success: !lastError,
          expiresAt: token ? new Date(token.expiresAt).toISOString() : null,
          error: lastError,
        };
      } catch (err) {
        return {
          success: false,
          expiresAt: null,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    return { error: `Unknown request: ${req.method} ${req.path}` };
  }

  async function start(socketPath: string = DEFAULT_SOCKET_PATH): Promise<void> {
    socketServer = new SocketServer(socketPath, handleRequest);
    await socketServer.start();

    // Start periodic refresh check
    refreshTimer = setInterval(() => {
      refreshIfNeeded().catch(console.error);
    }, REFRESH_CHECK_INTERVAL);

    // Initial refresh check
    await refreshIfNeeded();

    console.error(`[daemon] Auth daemon started on ${socketPath}`);
  }

  async function stop(): Promise<void> {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (socketServer) {
      await socketServer.stop();
      socketServer = null;
    }
    console.error('[daemon] Auth daemon stopped');
  }

  return {
    start,
    stop,
    handleRequest,
    refreshIfNeeded,
  };
}

// CLI entry point for daemon
export async function runDaemon(): Promise<void> {
  const daemon = createDaemon();

  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}

// Run if invoked directly
if (process.argv[1]?.endsWith('daemon.js') && process.argv.includes('--run')) {
  runDaemon().catch((err) => {
    console.error('[daemon] Fatal error:', err);
    process.exit(1);
  });
}
