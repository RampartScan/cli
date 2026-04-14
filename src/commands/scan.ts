import { Command } from 'commander';
import { RampartAPI } from '../api';

const PHASE_LABELS = [
  'DNS Reconnaissance', 'Subdomain Discovery', 'Security Headers',
  'TLS/SSL Analysis', 'Path Discovery', 'JS Bundle Analysis',
  'CORS Configuration', 'API Spec Discovery', 'AI Verification',
  'Attack Narratives',
];

export const scanCommand = new Command('scan')
  .description('Run a security scan')
  .argument('<domain>', 'Domain to scan')
  .option('--wait', 'Wait for scan to complete')
  .option('--json', 'Output results as JSON')
  .action(async (domain: string, options: any) => {
    try {
      const api = new RampartAPI();

      if (!options.json) {
        console.log(`\n🔍 Scanning ${domain}...\n`);
      }

      // Start scan
      const scan = await api.startScan(domain);
      const scanId = scan.scan_id || scan.id;

      if (!options.wait) {
        console.log(`Scan started (ID: ${scanId})`);
        console.log(`Check status: rampart scan status ${scanId}`);
        return;
      }

      // Poll for completion
      let lastPhaseIdx = -1;
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        
        const status = await api.getScanStatus(scanId);
        
        if (!options.json && status.phases) {
          for (let i = 0; i < status.phases.length; i++) {
            const phase = status.phases[i];
            if (i > lastPhaseIdx && phase.status === 'complete') {
              const findings = phase.findings_added || 0;
              console.log(`  ✅ ${phase.label}${findings > 0 ? `  ${findings} findings` : ''}`);
              lastPhaseIdx = i;
            }
          }
        }

        if (status.status === 'completed' || status.status === 'failed') {
          if (status.status === 'failed') {
            if (options.json) {
              console.log(JSON.stringify({ error: 'Scan failed', scanId }));
            } else {
              console.log('\n❌ Scan failed.');
            }
            process.exit(1);
          }
          break;
        }
      }

      // Get results
      const result = await api.getScan(scanId);
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Display results
      const summary = result.summary || {};
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`  Score: ${summary.score || '?'}/100 (Grade ${summary.grade || '?'})`);
      
      const total = summary.total_findings || 0;
      const parts = [];
      if (summary.critical) parts.push(`${summary.critical} Critical`);
      if (summary.high) parts.push(`${summary.high} High`);
      if (summary.medium) parts.push(`${summary.medium} Medium`);
      if (summary.low) parts.push(`${summary.low} Low`);
      console.log(`  Findings: ${total} (${parts.join(', ') || 'none'})`);
      
      console.log(`\n  View full report: https://rampartscan.com/dashboard/scans/${scanId}/report`);
      
      // Show credits
      try {
        const credits = await api.getCredits();
        console.log(`  Credits remaining: ${credits.credits_remaining}/${credits.scan_credits}`);
      } catch {}
      
      console.log('');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// Sub-command: scan status
scanCommand
  .command('status <scanId>')
  .description('Check scan status')
  .action(async (scanId: string) => {
    try {
      const api = new RampartAPI();
      const status = await api.getScanStatus(parseInt(scanId));
      console.log(JSON.stringify(status, null, 2));
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

scanCommand
  .command('results <scanId>')
  .description('View scan results')
  .action(async (scanId: string) => {
    try {
      const api = new RampartAPI();
      const result = await api.getScan(parseInt(scanId));
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });
