import * as readline from 'node:readline';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';

function getFirebaseConfig() {
  const apiKey = process.env.COPILOT_FIREBASE_API_KEY;
  const projectId = process.env.COPILOT_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error(
      'Firebase configuration required. Set COPILOT_FIREBASE_API_KEY and COPILOT_FIREBASE_PROJECT_ID environment variables.\n' +
      'See README for details on obtaining these values.'
    );
  }

  return {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
  };
}

export interface EmailLinkAuthResult {
  token: string;
  expiresAt: number | null;
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function captureTokenWithEmailLink(): Promise<EmailLinkAuthResult> {
  const email = await prompt('Enter your Copilot Money email: ');
  if (!email) {
    throw new Error('Email is required');
  }

  console.log('\nCheck your email for the Copilot Money magic link.');
  console.log('After clicking the link, copy the FULL URL from your browser address bar.');
  console.log('(It should start with https://app.copilot.money/...)\n');

  const magicLink = await prompt('Paste the magic link URL: ');
  if (!magicLink) {
    throw new Error('Magic link URL is required');
  }

  let app: FirebaseApp | null = null;
  try {
    app = initializeApp(getFirebaseConfig(), 'copilot-money-mcp-auth');
    const auth = getAuth(app);

    if (!isSignInWithEmailLink(auth, magicLink)) {
      throw new Error('Invalid magic link URL. Please copy the full URL from your browser.');
    }

    const result = await signInWithEmailLink(auth, email, magicLink);
    const token = await result.user.getIdToken();

    const expiresAt = result.user.metadata.lastSignInTime
      ? new Date(result.user.metadata.lastSignInTime).getTime() + 60 * 60 * 1000
      : null;

    return { token, expiresAt };
  } finally {
    if (app) {
      await deleteApp(app);
    }
  }
}
