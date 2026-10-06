import { PropAccount, TradeExecution } from '../data/terminalData';

export interface ApiSyncResult {
  success: boolean;
  message: string;
  account_id?: string;
  account_number?: number;
  positions_synced?: number;
  deals_synced?: number;
  trades_created_or_updated?: number;
  synced_at?: string;
  error?: string;
}

export class ApiClient {
  private static baseUrl = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')}/api`;

  private static async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('nova_session');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401 && token && typeof window !== 'undefined') {
      sessionStorage.removeItem('nova_session');
      window.dispatchEvent(new Event('nova:auth-expired'));
    }
    return response;
  }

  public static async askAi(message: string, accountId?: string): Promise<{ response: string; toolCalls: Array<{ name: string; success: boolean }>; account: { currency: string; connection_status: string; balance: number; equity: number; realized_pnl_today: number; open_positions: number; last_synced_at: string | null } | null }> {
    const res = await this.request(`${this.baseUrl}/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, account_id: accountId }), signal: AbortSignal.timeout(30000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'NOVA could not answer that request.');
    return data.data;
  }
  public static async getAiStatus(): Promise<{ enabled: boolean }> {
    const res = await this.request(`${this.baseUrl}/ai/status`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Could not read NOVA AI status.');
    return (await res.json()).data;
  }

  public static async login(password: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok || !data.token) throw new Error(data.message || 'Unable to sign in.');
    return data.token as string;
  }

  private static async finance(path: string, init: RequestInit = {}): Promise<any> {
    let res: Response;
    try {
      res = await this.request(`${this.baseUrl}/finance${path}`, {
        ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      });
    } catch { throw new Error('Could not reach the NOVA backend.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
    return data;
  }
  public static getFinanceHistory(): Promise<any[]> { return this.finance('/history').then((d) => d.data); }
  private static async profileCall(path: string, init: RequestInit = {}): Promise<any> {
    let res: Response;
    try {
      res = await this.request(`${this.baseUrl}/profile${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
    } catch { throw new Error('Could not reach the NOVA backend.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
    return data;
  }
  public static getProfile(): Promise<any> { return this.profileCall('').then((d) => d.data); }
  public static updateProfile(patch: object): Promise<any> { return this.profileCall('', { method: 'PATCH', body: JSON.stringify(patch) }).then((d) => d.data); }
  public static changePassword(current: string, next: string): Promise<void> { return this.profileCall('/password', { method: 'POST', body: JSON.stringify({ current, next }) }).then(() => undefined); }
  public static async getFinanceItems(): Promise<any[]> { return (await this.finance('')).data; }
  public static addFinanceItem(item: object) { return this.finance('', { method: 'POST', body: JSON.stringify(item) }); }
  public static updateFinanceItem(id: string, value: number) { return this.finance(`/${id}`, { method: 'PATCH', body: JSON.stringify({ value }) }); }
  public static deleteFinanceItem(id: string) { return this.finance(`/${id}`, { method: 'DELETE' }); }

  /** Like getAccounts, but throws when the backend is unreachable so callers never mistake an outage for "no accounts". */
  public static async getAccountsStrict(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/accounts`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return (await res.json()).data || [];
  }

  public static async getAccounts(): Promise<any[]> {
    try {
      const res = await this.request(`${this.baseUrl}/accounts`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.data || [];
    } catch (err) {
      console.warn('[ApiClient] Failed to fetch accounts from backend:', (err as Error).message);
      return [];
    }
  }

  public static async getAccountById(id: string): Promise<any | null> {
    try {
      const res = await this.request(`${this.baseUrl}/accounts/${id}`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const data = await res.json();
      return data.data || null;
    } catch (err) {
      console.warn(`[ApiClient] Failed to fetch account ${id}:`, (err as Error).message);
      return null;
    }
  }

  public static async getAccountPositions(id: string): Promise<any[]> {
    try {
      const res = await this.request(`${this.baseUrl}/accounts/${id}/positions`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  public static async getTrades(accountId?: string): Promise<any[]> {
    try {
      const url = accountId && accountId !== 'ALL'
        ? `${this.baseUrl}/trades?account_id=${encodeURIComponent(accountId)}`
        : `${this.baseUrl}/trades`;
      const res = await this.request(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    } catch (err) {
      console.warn('[ApiClient] Failed to fetch trades:', (err as Error).message);
      return [];
    }
  }

  public static async syncAccount(accountId: string): Promise<ApiSyncResult> {
    try {
      const res = await this.request(`${this.baseUrl}/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return {
        success: false,
        message: 'Could not contact NOVA backend synchronization service.',
        error: (err as Error).message,
      };
    }
  }

  public static async syncLocalConnector(): Promise<ApiSyncResult> {
    try {
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(45000),
        targetAddressSpace: 'loopback',
      } as RequestInit & { targetAddressSpace: 'loopback' };
      const response = await fetch('http://127.0.0.1:5001/refresh', requestOptions);
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : {};
      if (!response.ok || !data.success) {
        return {
          success: false,
          message: data.message || data.error || `Local MT5 sync failed (HTTP ${response.status}).`,
          error: data.error,
        };
      }
      return data as ApiSyncResult;
    } catch (err) {
      return {
        success: false,
        message: (err as Error).message === 'Failed to fetch'
          ? 'Could not reach the local MT5 connector. Keep it running and allow NOVA local-network access in your browser.'
          : (err as Error).message || 'Could not sync with the local MT5 connector.',
      };
    }
  }

  public static async syncMT5(): Promise<ApiSyncResult> {
    try {
      const res = await this.request(`${this.baseUrl}/connector/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return {
        success: false,
        message: 'Could not contact the NOVA backend synchronization service.',
        error: (err as Error).message,
      };
    }
  }

  public static async createAccount(accountData: any): Promise<any | null> {
    try {
      const res = await this.request(`${this.baseUrl}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.data;
    } catch (err) {
      console.warn('[ApiClient] Failed to create account on backend:', (err as Error).message);
      return null;
    }
  }

  public static async deleteAccount(accountId: string): Promise<boolean> {
    try {
      const res = await this.request(`${this.baseUrl}/accounts/${accountId}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(4000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public static async updateTradeConfluences(
    tradeId: string,
    confluences: any
  ): Promise<boolean> {
    try {
      const res = await this.request(`${this.baseUrl}/trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confluences),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      console.warn('[ApiClient] Failed to patch trade confluences:', (err as Error).message);
      return false;
    }
  }
}
