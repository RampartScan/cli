import { getApiUrl } from './config';

export class TrialError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TrialError';
    this.code = code;
  }
}

export class TrialAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getApiUrl();
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const body: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Check for trial-specific error codes
      const code = body.code || body.error || '';
      if (code === 'TRIAL_EXPIRED' || code === 'TRIAL_EXHAUSTED') {
        throw new TrialError(body.message || body.detail || `Trial ${code.toLowerCase().replace('trial_', '')}`, code);
      }

      let detail: string;
      if (Array.isArray(body.detail)) {
        detail = body.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      } else if (typeof body.detail === 'object' && body.detail !== null) {
        detail = body.detail.message || body.detail.error || JSON.stringify(body.detail);
      } else {
        detail = body.detail || body.message || body.error || `HTTP ${res.status}`;
      }
      throw new Error(`API error (${res.status}): ${detail}`);
    }

    return body;
  }

  async requestTrial(email: string): Promise<{ ok: boolean; message: string; email: string; expiresIn: string }> {
    return this.request('/api/auth/trial', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyTrial(email: string, code: string): Promise<{
    ok: boolean;
    existing: boolean;
    apiKey: string;
    trial: { email: string; scansUsed: number; scanLimit: number; expiresAt: string };
  }> {
    return this.request('/api/auth/trial/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  async getTrialStatus(apiKey: string): Promise<{
    trial: boolean;
    email?: string;
    scansUsed?: number;
    scanLimit?: number;
    scansRemaining?: number;
    expiresAt?: string;
    expired?: boolean;
  }> {
    return this.request('/api/auth/trial/status', {
      headers: {
        'x-api-key': apiKey,
      },
    });
  }
}
