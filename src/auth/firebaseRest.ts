import { CopilotMoneyError } from '../types/error.js';

export function parseOobCodeFromUrl(pasted: string): string {
  const trimmed = pasted.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Pasted value is not a valid URL.');
  }
  const mode = url.searchParams.get('mode');
  const oobCode = url.searchParams.get('oobCode');
  if (mode !== 'signIn') {
    throw new CopilotMoneyError(
      'OOB_CODE_INVALID',
      `Expected a sign-in link (mode=signIn), got mode=${mode ?? 'unknown'}.`
    );
  }
  if (!oobCode) {
    throw new CopilotMoneyError('OOB_CODE_INVALID', 'Sign-in link missing oobCode parameter.');
  }
  return oobCode;
}
