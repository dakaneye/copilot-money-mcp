import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';
import { execFile } from 'node:child_process';

const COPILOT_APP_URL = 'https://app.copilot.money';
const CALLBACK_PATH = '/callback';

interface AuthResult {
  accessToken: string;
  refreshToken: string | null;
}

export async function performBrowserAuth(timeoutMs = 180_000): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    let server: Server | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let capturedToken: string | null = null;
    let settled = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (server) {
        server.close();
        server = null;
      }
    };

    const complete = (token: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ accessToken: token, refreshToken: null });
    };

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (url.pathname === CALLBACK_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Authentication successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      } else if (url.pathname === '/token') {
        const token = url.searchParams.get('token');
        if (token) {
          capturedToken = token;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));

          complete(token);
        } else {
          res.writeHead(400);
          res.end('Missing token');
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      if (!address || typeof address === 'string') {
        cleanup();
        reject(new Error('Failed to get server port'));
        return;
      }

      const port = address.port;
      const callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

      console.error(`\nOpening browser for Copilot Money authentication...`);
      console.error(`Callback URL: ${callbackUrl}`);
      console.error(`\nAfter logging in, copy your bearer token from the browser's`);
      console.error(`Network tab (look for Authorization header) and paste it below.\n`);

      const loginUrl = `${COPILOT_APP_URL}/login`;
      openBrowser(loginUrl);

      promptForToken()
        .then((token) => {
          if (token && !capturedToken) {
            complete(token);
          }
        })
        .catch(() => {
          // Ignore prompt errors
        });
    });

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Authentication timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' :
              'xdg-open';

  execFile(cmd, [url], (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      console.error(`Please open this URL manually: ${url}`);
    }
  });
}

async function promptForToken(): Promise<string | null> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question('Paste bearer token (or press Enter to wait for browser): ', (answer) => {
      rl.close();
      const token = answer.trim();
      resolve(token || null);
    });
  });
}
