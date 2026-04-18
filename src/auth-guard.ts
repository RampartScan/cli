import { getApiKey } from './config';
import { exec } from 'child_process';

const SIGNUP_URL = 'https://rampartscan.com/cli/sign-up';

/**
 * Ensures the user has an API key configured.
 * If not, opens the browser to sign up and exits.
 * Call this at the start of any command that needs auth.
 */
export function ensureApiKey(): string {
  const apiKey = getApiKey();
  if (apiKey) return apiKey;

  console.log('\n🔑 No API key found.\n');
  console.log('Opening browser to get your free trial key...\n');

  try {
    const platform = process.platform;
    if (platform === 'darwin') exec(`open "${SIGNUP_URL}"`);
    else if (platform === 'win32') exec(`start "${SIGNUP_URL}"`);
    else exec(`xdg-open "${SIGNUP_URL}"`);
  } catch {}

  console.log(`If the browser didn't open, visit: ${SIGNUP_URL}\n`);
  console.log('After signing up, copy your API key and run:');
  console.log('  rampart auth login\n');
  process.exit(0);
}
