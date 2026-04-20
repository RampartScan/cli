/**
 * Render scan findings to the terminal with enhanced detail
 * for specific finding types (e.g. Google OAuth Client IDs).
 */

const GOOGLE_OAUTH_PATTERN = /\.apps\.googleusercontent\.com$/;

interface Finding {
  id?: number;
  type?: string;
  title?: string;
  description?: string;
  severity?: string;
  value?: string;
  app_name?: string;
  metadata?: Record<string, any>;
  remediation?: string;
  source_url?: string;
  category?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '\x1b[31m',  // red
  high: '\x1b[33m',      // yellow
  medium: '\x1b[36m',    // cyan
  low: '\x1b[90m',       // gray
  info: '\x1b[90m',      // gray
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function severityTag(severity: string): string {
  const color = SEVERITY_COLORS[severity?.toLowerCase()] || '';
  return `${color}${(severity || 'unknown').toUpperCase()}${RESET}`;
}

/**
 * Check whether a finding value looks like a Google OAuth Client ID.
 */
function isGoogleOAuthClientId(finding: Finding): boolean {
  const value = finding.value || finding.metadata?.client_id || '';
  return GOOGLE_OAUTH_PATTERN.test(value);
}

/**
 * Render Google OAuth remediation guidance.
 */
function renderOAuthRemediation(finding: Finding): void {
  const appName = finding.app_name || finding.metadata?.app_name;
  const clientId = finding.value || finding.metadata?.client_id || '';

  if (appName) {
    console.log(`     ${BOLD}Application: ${appName}${RESET}`);
  } else {
    console.log(`     ${DIM}App name not resolved. To identify this application:${RESET}`);
    console.log(`     → Google Admin Console → Security → API Controls`);
    console.log(`       Search for client ID: ${clientId}`);
  }

  console.log('');
  console.log(`     ${BOLD}To investigate this OAuth client in your Google Workspace:${RESET}`);
  console.log('');
  console.log('     1. Enable the Admin SDK API:');
  console.log('        → https://console.cloud.google.com/apis/library/admin.googleapis.com');
  console.log('');
  console.log('     2. Grant audit log access to your service account:');
  console.log('        → https://admin.google.com/ac/owl/domainwidedelegation');
  console.log('        • Click "Add new"');
  console.log('        • Enter your service account\'s client ID');
  console.log('        • Add scope: https://www.googleapis.com/auth/admin.reports.audit.readonly');
  console.log('        • Click Authorize');
}

/**
 * Render a single finding to the terminal.
 */
function renderFinding(finding: Finding, index: number): void {
  const title = finding.title || finding.type || 'Unknown Finding';
  const severity = finding.severity || 'info';
  const value = finding.value || '';

  console.log(`  ${severityTag(severity)}  ${title}`);

  if (value) {
    console.log(`     Value: ${value}`);
  }

  if (finding.description) {
    console.log(`     ${DIM}${finding.description}${RESET}`);
  }

  // Enhanced rendering for Google OAuth Client ID findings
  if (isGoogleOAuthClientId(finding)) {
    renderOAuthRemediation(finding);
  }

  if (finding.remediation && !isGoogleOAuthClientId(finding)) {
    console.log(`     ${BOLD}Remediation:${RESET} ${finding.remediation}`);
  }

  console.log('');
}

/**
 * Render all findings from a scan, with enhanced details for specific types.
 * Returns the number of findings rendered.
 */
export function renderFindings(findings: Finding[]): number {
  if (!findings || findings.length === 0) {
    return 0;
  }

  // Sort by severity: critical > high > medium > low > info
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  const sorted = [...findings].sort((a, b) => {
    const aOrder = severityOrder[a.severity?.toLowerCase() || 'info'] ?? 5;
    const bOrder = severityOrder[b.severity?.toLowerCase() || 'info'] ?? 5;
    return aOrder - bOrder;
  });

  console.log(`\n  ${BOLD}Findings:${RESET}\n`);

  for (let i = 0; i < sorted.length; i++) {
    renderFinding(sorted[i], i);
  }

  return sorted.length;
}

/**
 * Filter findings to only Google OAuth Client ID findings.
 */
export function getOAuthFindings(findings: Finding[]): Finding[] {
  return (findings || []).filter(isGoogleOAuthClientId);
}
