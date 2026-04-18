import { Command } from 'commander';
import { RampartAPI } from '../api';
import { ensureApiKey } from '../auth-guard';

export const creditsCommand = new Command('credits')
  .description('Check scan credit balance')
  .action(async () => {
    ensureApiKey();
    try {
      const api = new RampartAPI();
      const credits = await api.getCredits();
      
      console.log(`\n  Plan: ${credits.plan_slug || 'free'}`);
      console.log(`  Credits: ${credits.credits_remaining}/${credits.scan_credits}`);
      console.log(`  Used: ${credits.credits_used}`);
      if (credits.credits_reset_at) {
        console.log(`  Resets: ${new Date(credits.credits_reset_at).toLocaleDateString()}`);
      }
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });
