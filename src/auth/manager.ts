import { SocketClient } from './socket.js';
import { CopilotMoneyError } from '../types/error.js';

const TOKEN_CACHE_TTL = 30 * 1000; // 30 seconds

export class AuthManager {
  private cachedToken: string | null = null;
  private cachedExpiry: number = 0;
  private client: SocketClient;

  constructor(socketClient?: SocketClient) {
    this.client = socketClient ?? new SocketClient();
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.cachedExpiry) {
      return this.cachedToken;
    }

    try {
      const response = await this.client.getToken();
      this.cachedToken = response.token;
      this.cachedExpiry = Date.now() + TOKEN_CACHE_TTL;
      return response.token;
    } catch (error) {
      throw new CopilotMoneyError(
        'NOT_AUTHENTICATED',
        error instanceof Error ? error.message : 'Failed to get token from auth daemon'
      );
    }
  }

  async ensureAuthenticated(): Promise<string> {
    return this.getAccessToken();
  }

  async handleAuthError(): Promise<string> {
    // Clear cache and try to refresh
    this.cachedToken = null;
    this.cachedExpiry = 0;

    try {
      await this.client.refresh();
      return this.getAccessToken();
    } catch {
      throw new CopilotMoneyError(
        'NOT_AUTHENTICATED',
        "Session expired. Run 'copilot-auth login' to re-authenticate."
      );
    }
  }
}

let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
