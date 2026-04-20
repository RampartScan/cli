/**
 * Known-compromised OAuth application client IDs.
 *
 * Checked against Google Workspace OAuth grants and JS bundles.
 * Add new entries as incidents are disclosed.
 */

export interface IOCEntry {
  incident: string;
  appName?: string;
  description: string;
  source: string;
  dateAdded: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const KNOWN_BAD_OAUTH_CLIENT_IDS = new Map<string, IOCEntry>([
  [
    '110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com',
    {
      incident: 'Vercel April 2026 Security Incident',
      appName: 'Context.ai',
      description:
        'Third-party AI tool OAuth app compromised, leading to unauthorized access to Vercel internal systems.',
      source: 'https://vercel.com/kb/bulletin/vercel-april-2026-security-incident',
      dateAdded: '2026-04-19',
      severity: 'critical',
    },
  ],
]);
