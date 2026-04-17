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
      // Handle FastAPI validation errors (detail is an array)
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

    return res.json();
  }

  // ── Assets ──

  async listAssets(): Promise<any[]> {
    return this.request('/assets');
  }

  async createAsset(domain: string): Promise<any> {
    return this.request('/assets', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    });
  }

  async findOrCreateAsset(domain: string): Promise<number> {
    // Check if asset already exists
    const assets = await this.listAssets();
    const existing = assets.find((a: any) =>
      a.domain === domain
    );
    if (existing) {
      return existing.id;
    }
    // Create new asset
    const created = await this.createAsset(domain);
    return created.asset_id || created.id;
  }

  // ── Scans ──

  async startScan(assetId: number, scanType: string = 'full'): Promise<any> {
    return this.request('/scans', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetId, scan_type: scanType }),
    });
  }

  async getScanStatus(scanId: number): Promise<any> {
    return this.request(`/scans/${scanId}/status`);
  }

  async getScan(scanId: number): Promise<any> {
    return this.request(`/scans/${scanId}`);
  }

  async getScanFindings(scanId: number): Promise<any> {
    return this.request(`/findings?scan_id=${scanId}`);
  }

  async listScans(): Promise<any> {
    return this.request('/scans');
  }

  // ── Credits ──

  async getCredits(): Promise<any> {
    return this.request('/credits');
  }
}
