import { PropAccount, TradeExecution, NavSection } from '../data/terminalData';

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

  public static async askAi(message: string, accountId?: string, onChunk?: (text: string) => void, context?: { history?: Array<{ role: 'user' | 'assistant'; text: string }>; activeTab?: string; mode?: 'voice' | 'text' }): Promise<{ response: string; toolCalls: Array<{ name: string; success: boolean }>; account: { currency: string; connection_status: string; balance: number; equity: number; realized_pnl_today: number; open_positions: number; last_synced_at: string | null } | null; dashboard: Record<string, unknown> | null; navigation: { page: NavSection; label: string } | null }> {
    const streaming = Boolean(onChunk);
    const res = await this.request(`${this.baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(streaming ? { Accept: 'text/event-stream' } : {}) },
      body: JSON.stringify({ message, account_id: accountId, stream: streaming, history: context?.history, active_tab: context?.activeTab, mode: context?.mode }),
      signal: AbortSignal.timeout(60000),
    });
    if (!streaming || !res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'NOVA could not answer that request.');
      return data.data;
    }
    if (!res.body) throw new Error('NOVA did not return a response stream.');

    let responseText = '';
    let completed: any = null;
    const consumeEvent = (block: string) => {
      const line = block.split(/\r?\n/).find((item) => item.startsWith('data:'));
      if (!line) return;
      const event = JSON.parse(line.slice(5).trim());
      if (event.type === 'chunk' && typeof event.text === 'string') {
        responseText += event.text;
        onChunk?.(event.text);
      } else if (event.type === 'done') {
        completed = event.data;
      } else if (event.type === 'error') {
        throw new Error(event.error?.message || 'NOVA could not complete that request.');
      }
    };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) consumeEvent(block);
      if (done) break;
    }
    if (buffer.trim()) consumeEvent(buffer);
    if (!completed) throw new Error('NOVA response stream ended before completion.');
    return { ...completed, response: responseText || completed.response || '' };
  }
  public static async getAiStatus(): Promise<{ enabled: boolean; provider: string | null; expected_key?: string }> {
    const res = await this.request(`${this.baseUrl}/ai/status`, { signal: AbortSignal.timeout(25000) });
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
  public static async listMemories(): Promise<Array<{ id: string; kind: string; content: string; created_at: string }>> {
    const res = await this.request(`${this.baseUrl}/ai/memory`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Could not load memories (HTTP ${res.status}).`);
    return (await res.json()).data || [];
  }
  public static async deleteMemory(id: string): Promise<void> {
    const res = await this.request(`${this.baseUrl}/ai/memory/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Could not delete that memory (HTTP ${res.status}).`);
  }
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
