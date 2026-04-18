import { Command } from 'commander';
import { Listr, ListrTask } from 'listr2';
import { RampartAPI } from '../api';

const SCAN_PHASES = [
  'DNS Reconnaissance',
  'Subdomain Discovery',
  'CT Log Query',
  'WHOIS Lookup',
  'Security Headers',
  'TLS/SSL Analysis',
  'Path Discovery',
  'JS Bundle Analysis',
  'CORS Configuration',
  'API Spec Discovery',
  'Unauthenticated API Testing',
  'AI Verification',
  'Attack Narrative Enrichment',
];

const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes max wait
const POLL_INTERVAL_MS = 2000;

interface PhaseStatus {
  label: string;
  status: 'pending' | 'running' | 'complete' | 'timed_out';
  findings_added: number;
}

export const scanCommand = new Command('scan')
  .description('Run a security scan')
  .argument('<domain>', 'Domain to scan')
  .option('--json', 'Output results as JSON')
  .option('--timeout <minutes>', 'Max wait time in minutes (default: 10)', '10')
  .action(async (domain: string, options: any) => {
    try {
      const api = new RampartAPI();
      const maxWaitMs = parseInt(options.timeout) * 60 * 1000 || MAX_WAIT_MS;

      if (!options.json) {
        console.log(`\n🔍 Starting scan for ${domain}...\n`);
      }

      // Find or create asset for this domain
      if (!options.json) {
        console.log(`  Setting up asset...`);
      }
      const assetId = await api.findOrCreateAsset(domain);

      // Start scan
      const scan = await api.startScan(assetId);
      const scanId = scan.scan_id || scan.id;

      // Build listr2 task list
      const phaseStates = new Map<string, PhaseStatus>();
      SCAN_PHASES.forEach(label => {
        phaseStates.set(label, { label, status: 'pending', findings_added: 0 });
      });

      let scanStatus = 'running';

      const tasks = new Listr(
        SCAN_PHASES.map((label): ListrTask => ({
          title: label,
          task: async (_ctx, task) => {
            // Wait until this phase completes, times out, or scan finishes
            const startTime = Date.now();
            while (true) {
              const state = phaseStates.get(label);
              if (state?.status === 'complete') {
                const findings = state.findings_added || 0;
                if (findings > 0) {
                  task.title = `${label}  (${findings} finding${findings !== 1 ? 's' : ''})`;
                }
                return;
              }
              if (state?.status === 'timed_out') {
                task.title = `${label}  (timed out)`;
                return;
              }
              if (scanStatus === 'completed' || scanStatus === 'failed') {
                // Scan finished — mark any remaining phases as done
                return;
              }
              if (Date.now() - startTime > maxWaitMs) {
                task.title = `${label}  (timeout)`;
                return;
              }
              await new Promise(r => setTimeout(r, 500));
            }
          },
        })),
        {
          concurrent: false,
          rendererOptions: {
            collapseSubtasks: false,
            showTimer: false,
          },
        }
      );

      // Start polling in background
      const pollPromise = (async () => {
        const startTime = Date.now();
        while (scanStatus === 'running' || scanStatus === 'queued') {
          if (Date.now() - startTime > maxWaitMs) {
            scanStatus = 'timeout';
            break;
          }

          try {
            const status = await api.getScanStatus(scanId);
            scanStatus = status.status || 'running';

            // Update phase states from backend
            if (status.phases) {
              for (const phase of status.phases) {
                phaseStates.set(phase.label, {
                  label: phase.label,
                  status: phase.status,
                  findings_added: phase.findings_added || 0,
                });
              }
            }
          } catch {
            // Transient error — keep polling
          }

          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
      })();

      // Run tasks and polling concurrently
      await Promise.all([
        tasks.run().catch(() => {}), // listr handles its own errors
        pollPromise,
      ]);

      if (scanStatus === 'failed') {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Scan failed', scan_id: scanId }));
        } else {
          console.log('\n❌ Scan failed.');
        }
        process.exit(1);
      }

      if (scanStatus === 'timeout') {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Scan timed out', scan_id: scanId }));
        } else {
          console.log(`\n⏰ Scan timed out after ${options.timeout} minutes.`);
          console.log(`Check status: rampart scan status ${scanId}`);
        }
        process.exit(1);
      }

      // Get results — fetch both endpoints:
      // GET /scans/{id} has score, grade, findings (total count)
      // GET /scans/{id}/status has severity_counts breakdown
      const result = await api.getScan(scanId);
      const statusResult = await api.getScanStatus(scanId);

      if (options.json) {
        console.log(JSON.stringify({ ...result, severity_counts: statusResult.severity_counts }, null, 2));
        return;
      }

      // Display results
      const score = result.score ?? statusResult.score;
      const grade = result.grade ?? statusResult.grade;
      const totalFindings = result.findings ?? statusResult.findings_count ?? 0;
      const severityCounts = statusResult.severity_counts || {};

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`  Score: ${score ?? '?'}/100 (Grade ${grade ?? '?'})`);

      const parts: string[] = [];
      if (severityCounts.critical) parts.push(`\x1b[31m${severityCounts.critical} Critical\x1b[0m`);
      if (severityCounts.high) parts.push(`\x1b[33m${severityCounts.high} High\x1b[0m`);
      if (severityCounts.medium) parts.push(`${severityCounts.medium} Medium`);
      if (severityCounts.low) parts.push(`${severityCounts.low} Low`);
      console.log(`  Findings: ${totalFindings} (${parts.join(', ') || 'none'})`);

      console.log(`\n  📄 Full report: https://rampartscan.com/dashboard/scans/${scanId}/report`);

      // Show credits
      try {
        const credits = await api.getCredits();
        console.log(`  💳 Credits remaining: ${credits.credits_remaining}/${credits.scan_credits}`);
      } catch {}

      console.log('');
    } catch (err: any) {
      if (options?.json) {
        console.log(JSON.stringify({ error: err.message }));
      } else {
        console.error(`\n❌ ${err.message}`);
      }
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
