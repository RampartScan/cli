import { Command } from 'commander';
import { setApiKey, getApiKey, getTrialInfo, clearTrialInfo, isTrialKey } from '../config';
import { runTrialFlow } from '../trial';
import { TrialAPI } from '../trial-api';

export const authCommand = new Command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Authenticate with Rampart')
  .option('--api-key <key>', 'Set API key directly')
  .action(async (options) => {
    if (options.apiKey) {
      setApiKey(options.apiKey);
      clearTrialInfo();
      console.log('✅ API key saved. You can now run scans.');
      return;
    }

    console.log('Enter your Rampart API key (from https://rampartscan.com/dashboard/settings):');
    // Simple stdin read
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('API Key: ', (key: string) => {
      if (key.trim()) {
        setApiKey(key.trim());
        clearTrialInfo();
        console.log('✅ API key saved.');
      } else {
        console.log('❌ No key provided.');
      }
      rl.close();
    });
  });

authCommand
  .command('trial')
  .description('Start or check a free trial')
  .action(async () => {
    const trial = getTrialInfo();
    const apiKey = getApiKey();

    // If active trial exists, show status instead
    if (trial && apiKey) {
      try {
        const api = new TrialAPI();
        const status = await api.getTrialStatus(apiKey);

        if (status.trial && !status.expired) {
          const remaining = status.scans_remaining ?? (trial.scanLimit - trial.scansUsed);
          const expiryDate = new Date(status.expires_at || trial.expiresAt).toLocaleDateString();
          console.log(`\n✅ Trial account (${status.email || trial.email})`);
          console.log(`   Scans remaining: ${remaining}/${status.scan_limit || trial.scanLimit}`);
          console.log(`   Expires: ${expiryDate}`);
          console.log(`\n⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing\n`);
          return;
        }
      } catch {
        // Server check failed — fall through to start a new trial
      }
    }

    const success = await runTrialFlow();
    if (!success) {
      process.exit(1);
    }
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    const key = getApiKey();
    if (!key) {
      console.log('❌ Not authenticated. Run "rampart auth login" or "rampart auth trial".');
      return;
    }

    const trial = getTrialInfo();

    if (trial && isTrialKey()) {
      // Refresh trial info from server
      try {
        const api = new TrialAPI();
        const status = await api.getTrialStatus(key);

        const email = status.email || trial.email;
        const remaining = status.scans_remaining ?? (trial.scanLimit - trial.scansUsed);
        const limit = status.scan_limit || trial.scanLimit;
        const expiryDate = new Date(status.expires_at || trial.expiresAt).toLocaleDateString();

        if (status.expired) {
          console.log(`\n⚠️  Trial expired (${email})`);
        } else {
          console.log(`\n✅ Trial account (${email})`);
        }
        console.log(`   Scans: ${remaining}/${limit} remaining`);
        console.log(`   Expires: ${expiryDate}`);
        console.log(`\n⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing\n`);
      } catch {
        // Server unavailable — show cached info
        const remaining = trial.scanLimit - trial.scansUsed;
        const expiryDate = new Date(trial.expiresAt).toLocaleDateString();
        console.log(`\n✅ Trial account (${trial.email})`);
        console.log(`   Scans: ${remaining}/${trial.scanLimit} remaining`);
        console.log(`   Expires: ${expiryDate}`);
        console.log(`\n⭐ Upgrade for unlimited scans: https://rampartscan.com/pricing\n`);
      }
    } else {
      const masked = key.slice(0, 8) + '...' + key.slice(-4);
      console.log(`✅ Authenticated (${masked})`);
    }
  });

authCommand
  .command('logout')
  .description('Remove saved API key')
  .action(() => {
    setApiKey('');
    clearTrialInfo();
    console.log('✅ Logged out.');
  });
