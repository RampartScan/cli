import * as readline from 'readline';
import { TrialAPI } from './trial-api';
import { setApiKey, setTrialInfo } from './config';

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

export async function runTrialFlow(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\n🚀 Try Rampart free — 1 scan, no credit card required.\n');

    const email = await prompt(rl, 'Email: ');
    if (!email) {
      console.log('❌ No email provided.');
      return false;
    }

    const api = new TrialAPI();

    try {
      await api.requestTrial(email);
    } catch (err: any) {
      console.log(`\n❌ ${err.message}`);
      return false;
    }

    console.log(`\n📧 We sent a 6-digit code to ${email}\n`);

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const code = await prompt(rl, 'Verification code: ');
      if (!code) {
        console.log('❌ No code provided.');
        if (attempt < MAX_ATTEMPTS) {
          console.log(`  Try again (${MAX_ATTEMPTS - attempt} attempt${MAX_ATTEMPTS - attempt !== 1 ? 's' : ''} remaining)\n`);
          continue;
        }
        return false;
      }

      try {
        const result = await api.verifyTrial(email, code);

        // Save API key and trial info (convert snake_case → camelCase for local config)
        setApiKey(result.api_key);
        setTrialInfo({
          email: result.trial.email,
          scanLimit: result.trial.scan_limit,
          scansUsed: result.trial.scans_used,
          expiresAt: result.trial.expires_at,
        });

        const remaining = result.trial.scan_limit - result.trial.scans_used;
        const expiryDate = new Date(result.trial.expires_at).toLocaleDateString();

        if (result.existing) {
          console.log(`\n✅ Welcome back! Trial restored for ${email}`);
        } else {
          console.log(`\n✅ Trial activated for ${email}`);
        }
        console.log(`   ${remaining} scan${remaining !== 1 ? 's' : ''} remaining (expires ${expiryDate})\n`);

        return true;
      } catch (err: any) {
        if (attempt < MAX_ATTEMPTS) {
          console.log(`\n❌ ${err.message}`);
          console.log(`   Try again (${MAX_ATTEMPTS - attempt} attempt${MAX_ATTEMPTS - attempt !== 1 ? 's' : ''} remaining)\n`);
        } else {
          console.log(`\n❌ ${err.message}`);
          console.log('   Maximum attempts reached.\n');
          return false;
        }
      }
    }

    return false;
  } finally {
    rl.close();
  }
}
