import { Command } from 'commander';
import { execSync } from 'child_process';
import { KNOWN_BAD_OAUTH_CLIENT_IDS, IOCEntry } from '../ioc-database';

const PERMISSIONS_URL = 'https://myaccount.google.com/permissions';
const REPORTS_API_BASE =
  'https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/token';

interface MatchRecord {
  clientId: string;
  ioc: IOCEntry;
  actorEmail: string;
  time: string;
}

/**
 * Open a URL in the default browser (same approach as auth-guard.ts).
 */
function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'win32') execSync(`start "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    // Silently fail — we print the URL as fallback
  }
}

/**
 * Check if gcloud CLI is installed. Returns true if available.
 */
function checkGcloud(): boolean {
  try {
    execSync('gcloud --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a gcloud access token.
 * Throws on failure so callers can handle the fallback.
 */
function getAccessToken(): string {
  const token = execSync('gcloud auth print-access-token', {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
  }).trim();
  if (!token) {
    throw new Error('Empty token returned from gcloud');
  }
  return token;
}

/**
 * Fetch all OAuth token authorization events from Google Admin Reports API.
 * Handles pagination automatically.
 */
async function fetchOAuthGrants(
  token: string
): Promise<any[]> {
  const allItems: any[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      eventName: 'authorize',
      maxResults: '1000',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const url = `${REPORTS_API_BASE}?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          'Insufficient permissions. You need Google Workspace admin privileges.\n' +
          '   Required scope: https://www.googleapis.com/auth/admin.reports.audit.readonly\n' +
          '   Required role: Google Workspace Super Admin or Reports Admin'
        );
      }
      if (res.status === 401) {
        throw new Error(
          'Authentication failed. Run `gcloud auth login` first.'
        );
      }
      const body = await res.text().catch(() => '');
      throw new Error(`API error (${res.status}): ${body}`);
    }

    const data: any = await res.json();
    if (data.items && Array.isArray(data.items)) {
      allItems.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allItems;
}

/**
 * Extract client_id values from an activity item's events.
 */
function extractClientIds(item: any): string[] {
  const clientIds: string[] = [];
  if (!item.events || !Array.isArray(item.events)) return clientIds;

  for (const event of item.events) {
    if (!event.parameters || !Array.isArray(event.parameters)) continue;
    for (const param of event.parameters) {
      if (param.name === 'client_id' && param.value) {
        clientIds.push(param.value);
      }
    }
  }
  return clientIds;
}

/**
 * Open the browser to the permissions page and print manual instructions.
 * Shared by the manual flow and as the fallback when --gcloud-admin fails.
 */
function openManualCheck(): void {
  console.log('Opening Google Account permissions page...\n');

  openBrowser(PERMISSIONS_URL);

  console.log(`If the browser didn't open, visit: ${PERMISSIONS_URL}\n`);
  console.log('Look for the following compromised OAuth apps:\n');

  for (const [clientId, ioc] of KNOWN_BAD_OAUTH_CLIENT_IDS) {
    console.log(`  \x1b[31m⚠  ${ioc.incident}\x1b[0m`);
    console.log(`     Client ID: ${clientId}`);
    console.log(`     ${ioc.description}`);
    console.log(`     Source: ${ioc.source}`);
    console.log('');
  }

  console.log(
    'If you see any of the above apps in your "Third-party apps with account access",'
  );
  console.log('revoke their access immediately.\n');
}

/**
 * Run the manual (personal account) check flow.
 */
function runManualCheck(): void {
  console.log('\n🔍 IOC Check — Manual Mode\n');

  openManualCheck();

  console.log(
    '💡 For automated checking across your entire Google Workspace, run:'
  );
  console.log('   rampart ioc-check --gcloud-admin\n');
}

/**
 * Log a warning and fall back to the manual browser check.
 */
function fallbackToManual(reason: string): void {
  console.warn(reason);
  console.log('\nFalling back to manual check...\n');
  openManualCheck();
}

/**
 * Run the automated Google Workspace admin check flow.
 */
async function runAdminCheck(): Promise<void> {
  console.log('\n🔍 IOC Check — Google Workspace Admin Mode\n');

  // 1. Check gcloud
  if (!checkGcloud()) {
    fallbackToManual(
      '❌ gcloud CLI not found.\n' +
      '   Install from: https://cloud.google.com/sdk/docs/install\n'
    );
    return;
  }

  // 2. Get access token
  console.log('  Authenticating via gcloud...');
  let token: string;
  try {
    token = getAccessToken();
  } catch {
    fallbackToManual(
      '❌ Failed to get access token. Run `gcloud auth login` first.'
    );
    return;
  }
  console.log('  ✅ Token acquired\n');

  // 3. Fetch OAuth grants
  console.log('  Fetching OAuth token grants from Admin Reports API...');
  let items: any[];
  try {
    items = await fetchOAuthGrants(token);
  } catch (err: any) {
    fallbackToManual(`❌ ${err.message}`);
    return;
  }
  console.log(`  ✅ Retrieved ${items.length} activity record(s)\n`);

  // 4. Cross-reference against IOC database
  const matches: MatchRecord[] = [];
  let totalGrantsChecked = 0;

  for (const item of items) {
    const clientIds = extractClientIds(item);
    totalGrantsChecked += clientIds.length;

    for (const clientId of clientIds) {
      const ioc = KNOWN_BAD_OAUTH_CLIENT_IDS.get(clientId);
      if (ioc) {
        matches.push({
          clientId,
          ioc,
          actorEmail: item.actor?.email || 'unknown',
          time: item.id?.time || 'unknown',
        });
      }
    }
  }

  // 5. Report results
  if (matches.length > 0) {
    console.log(
      '\x1b[31m' +
        '  ╔══════════════════════════════════════════════════════════════╗\n' +
        '  ║  🚨 CRITICAL: Compromised OAuth app(s) detected!           ║\n' +
        '  ╚══════════════════════════════════════════════════════════════╝' +
        '\x1b[0m\n'
    );

    for (const match of matches) {
      console.log(`  \x1b[31m⚠  ${match.ioc.incident}\x1b[0m`);
      console.log(`     Severity:   ${match.ioc.severity.toUpperCase()}`);
      console.log(`     Client ID:  ${match.clientId}`);
      console.log(`     Authorized: ${match.actorEmail} at ${match.time}`);
      console.log(`     ${match.ioc.description}`);
      console.log(`     Source:     ${match.ioc.source}`);
      console.log('');
    }

    console.log('\x1b[31m  Action required:\x1b[0m');
    console.log('    1. Revoke the app immediately in Google Admin Console');
    console.log(
      '       https://admin.google.com/ac/owl/list?tab=configuredApps'
    );
    console.log('    2. Review affected user accounts for unauthorized activity');
    console.log('    3. Rotate any credentials the app may have accessed\n');
  } else {
    console.log(
      '  ✅ No known-compromised OAuth apps found in your Google Workspace\n'
    );
  }

  // 6. Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  OAuth grants checked:  ${totalGrantsChecked}`);
  console.log(`  IOCs checked against:  ${KNOWN_BAD_OAUTH_CLIENT_IDS.size}`);
  console.log(`  Matches found:         ${matches.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

export const iocCheckCommand = new Command('ioc-check')
  .description(
    'Check for known-compromised Google OAuth apps (IOC detection)'
  )
  .option(
    '--gcloud-admin',
    'Automated check via Google Admin SDK (requires gcloud CLI and Workspace admin)'
  )
  .action(async (options: { gcloudAdmin?: boolean }) => {
    try {
      if (options.gcloudAdmin) {
        await runAdminCheck();
      } else {
        runManualCheck();
      }
    } catch (err: any) {
      if (options.gcloudAdmin) {
        fallbackToManual(`❌ ${err.message}`);
      } else {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
      }
    }
  });
