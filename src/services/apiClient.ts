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
  private static baseUrl = '/api';

  public static async getAccounts(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/accounts`, { signal: AbortSignal.timeout(4000) });
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
      const res = await fetch(`${this.baseUrl}/accounts/${id}`, { signal: AbortSignal.timeout(4000) });
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
      const res = await fetch(`${this.baseUrl}/accounts/${id}/positions`, { signal: AbortSignal.timeout(4000) });
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
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
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
      const res = await fetch(`${this.baseUrl}/accounts/${accountId}/sync`, {
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

  public static async createAccount(accountData: any): Promise<any | null> {
    try {
      const res = await fetch(`${this.baseUrl}/accounts`, {
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
      const res = await fetch(`${this.baseUrl}/accounts/${accountId}`, {
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
      const res = await fetch(`${this.baseUrl}/trades/${tradeId}`, {
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
