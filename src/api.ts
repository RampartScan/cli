import { getApiKey, getApiUrl } from './config';

export class RampartAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = getApiUrl();
    this.apiKey = getApiKey();
    if (!this.apiKey) {
      throw new Error('No API key configured. Run "rampart auth login" or set RAMPART_API_KEY.');
    }
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}/security_sauron${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body: any = await res.json().catch(() => ({}));
      throw new Error(body.message || body.detail || `API error: ${res.status}`);
    }

    return res.json();
  }

  async startScan(domain: string): Promise<any> {
    return this.request('/scans', {
      method: 'POST',
      body: JSON.stringify({ domain, scan_type: 'full' }),
    });
  }

  async getScanStatus(scanId: number): Promise<any> {
    return this.request(`/scans/${scanId}/status`);
  }

  async getScan(scanId: number): Promise<any> {
    return this.request(`/scans/${scanId}`);
  }

  async getScanFindings(scanId: number): Promise<any> {
    return this.request(`/scans/${scanId}/findings`);
  }

  async listScans(): Promise<any> {
    return this.request('/scans');
  }

  async getCredits(): Promise<any> {
    return this.request('/credits');
  }
}
