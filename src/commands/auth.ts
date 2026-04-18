import { Command } from 'commander';
import { setApiKey, getApiKey } from '../config';

export const authCommand = new Command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Authenticate with Rampart')
  .option('--api-key <key>', 'Set API key directly')
  .action(async (options) => {
    if (options.apiKey) {
      setApiKey(options.apiKey);
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
        console.log('✅ API key saved.');
      } else {
        console.log('❌ No key provided.');
      }
      rl.close();
    });
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(() => {
    const key = getApiKey();
    if (key) {
      const masked = key.slice(0, 8) + '...' + key.slice(-4);
      console.log(`✅ Authenticated (${masked})`);
    } else {
      console.log('❌ Not authenticated. Run "rampart auth login".');
    }
  });

authCommand
  .command('logout')
  .description('Remove saved API key')
  .action(() => {
    setApiKey('');
    console.log('✅ Logged out.');
  });
