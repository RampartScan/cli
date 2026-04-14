import { Command } from 'commander';
import { RampartAPI } from '../api';

export const scansCommand = new Command('scans')
  .description('Manage scans');

scansCommand
  .command('list')
  .description('List recent scans')
  .action(async () => {
    try {
      const api = new RampartAPI();
      const scans = await api.listScans();
      
      const list = Array.isArray(scans) ? scans : scans.scans || [];
      
      if (list.length === 0) {
        console.log('\nNo scans yet. Run: rampart scan <domain>\n');
        return;
      }

      console.log('');
      for (const scan of list.slice(0, 10)) {
        const grade = scan.grade || scan.summary?.grade || '?';
        const target = scan.target || scan.domain || '?';
        const status = scan.status || '?';
        const date = scan.created_at ? new Date(scan.created_at).toLocaleDateString() : '?';
        console.log(`  [${grade}] ${target} — ${status} — ${date}`);
      }
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });
