import type {
  LogicalTrade,
  MT5AccountSnapshot,
  MT5DealSnapshot,
  MT5PositionSnapshot,
  TradingAccountRecord,
} from '../types.ts';

class InMemoryStore {
  private accounts: Map<string, TradingAccountRecord> = new Map();
  private positions: Map<string, MT5PositionSnapshot[]> = new Map();
  private deals: Map<string, MT5DealSnapshot[]> = new Map();
  private trades: Map<string, LogicalTrade[]> = new Map();

  constructor() {
    this.seedDefaultAccount();
  }

  private seedDefaultAccount() {
    const defaultAccountId = 'acc-mt5-primary';
    const account: TradingAccountRecord = {
      id: defaultAccountId,
      account_name: 'FundingPips Evaluation Phase 1',
      account_number: 884192,
      broker_name: 'FundingPips',
      server_name: 'FundingPips-Server',
      account_type: 'evaluation',
      currency: 'USD',
      leverage: 100,
      starting_balance: 5000.0,
      current_balance: 5000.0,
      current_equity: 5000.0,
      credit: 0.0,
      margin: 0.0,
      free_margin: 5000.0,
      margin_level: 0.0,
      connection_status: 'DISCONNECTED',
      bridge_protocol: 'PYTHON_CONNECTOR',
      is_active: true,
      last_synced_at: undefined,
      positions_count: 0,
      trades_count: 0,
      prop_firm: {
        trading_account_id: defaultAccountId,
        prop_firm_name: 'FundingPips',
        program_name: '5K Evaluation',
        max_loss_percent: 10.0,
        max_loss_limit: 500.0,
        daily_loss_percent: 5.0,
        daily_loss_limit: 250.0,
        current_daily_drawdown: 0.0,
        current_max_drawdown: 0.0,
        peak_watermark: 5000.0,
        breach_status: 'SAFE',
      },
      prop_phase: {
        phase_name: 'Phase 1 Evaluation',
        starting_balance: 5000.0,
        profit_target_percent: 6.0,
        profit_target_amount: 300.0,
        pass_threshold: 5300.0,
        minimum_trading_days: 0,
        current_trading_days: 0,
        current_profit: 0.0,
        progress_percentage: 0.0,
        remaining_target: 300.0,
        phase_status: 'IN_PROGRESS',
      },
    };

    this.accounts.set(defaultAccountId, account);
    this.positions.set(defaultAccountId, []);
    this.deals.set(defaultAccountId, []);
    this.trades.set(defaultAccountId, []);
  }

  public async getAllAccounts(): Promise<TradingAccountRecord[]> {
    return Array.from(this.accounts.values());
  }

  public async getAccount(id: string): Promise<TradingAccountRecord | null> {
    return this.accounts.get(id) || null;
  }

  public async createAccount(acc: TradingAccountRecord): Promise<TradingAccountRecord> {
    this.accounts.set(acc.id, acc);
    if (!this.positions.has(acc.id)) this.positions.set(acc.id, []);
    if (!this.deals.has(acc.id)) this.deals.set(acc.id, []);
    if (!this.trades.has(acc.id)) this.trades.set(acc.id, []);
    return acc;
  }

  public async deleteAccount(id: string): Promise<boolean> {
    const existed = this.accounts.delete(id);
    this.positions.delete(id);
    this.deals.delete(id);
    this.trades.delete(id);
    return existed;
  }

  public async getPositions(accountId: string): Promise<MT5PositionSnapshot[]> {
    return this.positions.get(accountId) || [];
  }

  public async getTrades(accountId: string): Promise<LogicalTrade[]> {
    return this.trades.get(accountId) || [];
  }

  public async getAllTrades(): Promise<LogicalTrade[]> {
    const all: LogicalTrade[] = [];
    for (const list of this.trades.values()) {
      all.push(...list);
    }
    return all.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
  }

  public async updateTradeConfluences(
    tradeId: string,
    confluences: any
  ): Promise<LogicalTrade | null> {
    for (const [accId, tradeList] of this.trades.entries()) {
      const idx = tradeList.findIndex((t) => t.id === tradeId || t.primary_ticket.toString() === tradeId);
      if (idx !== -1) {
        const current = tradeList[idx];
        const updated: LogicalTrade = {
          ...current,
          confluences: {
            ...current.confluences,
            ...confluences,
          },
        };
        tradeList[idx] = updated;
        this.trades.set(accId, tradeList);
        return updated;
      }
    }
    return null;
  }

  public updateAccountSync(
    accountId: string,
    accountSnapshot: MT5AccountSnapshot,
    positions: MT5PositionSnapshot[],
    deals: MT5DealSnapshot[],
    logicalTrades: LogicalTrade[]
  ): void {
    let acc = this.accounts.get(accountId);
    if (!acc) {
      acc = {
        id: accountId,
        account_name: `${accountSnapshot.broker_name} #${accountSnapshot.account_number}`,
        account_number: accountSnapshot.account_number,
        broker_name: accountSnapshot.broker_name,
        server_name: accountSnapshot.server_name,
        account_type: 'evaluation',
        currency: accountSnapshot.currency || 'USD',
        leverage: accountSnapshot.leverage || 100,
        starting_balance: accountSnapshot.balance,
        current_balance: accountSnapshot.balance,
        current_equity: accountSnapshot.equity,
        credit: accountSnapshot.credit || 0,
        margin: accountSnapshot.margin || 0,
        free_margin: accountSnapshot.free_margin || accountSnapshot.balance,
        margin_level: accountSnapshot.margin_level || 0,
        connection_status: 'CONNECTED',
        bridge_protocol: 'PYTHON_CONNECTOR',
        is_active: true,
      };
    }

    const netProfit = Number((accountSnapshot.balance - acc.starting_balance).toFixed(2));
    const targetProfit = acc.prop_phase?.profit_target_amount || acc.starting_balance * 0.06;
    const progressPct = Number(Math.min(100, Math.max(0, (netProfit / targetProfit) * 100)).toFixed(1));

    acc = {
      ...acc,
      current_balance: accountSnapshot.balance,
      current_equity: accountSnapshot.equity,
      credit: accountSnapshot.credit || 0,
      margin: accountSnapshot.margin || 0,
      free_margin: accountSnapshot.free_margin || accountSnapshot.balance,
      margin_level: accountSnapshot.margin_level || 0,
      connection_status: 'CONNECTED',
      last_synced_at: new Date().toISOString(),
      positions_count: positions.length,
      trades_count: logicalTrades.length,
      prop_phase: acc.prop_phase
        ? {
            ...acc.prop_phase,
            current_profit: netProfit,
            progress_percentage: progressPct,
            remaining_target: Math.max(0, targetProfit - netProfit),
            phase_status: netProfit >= targetProfit ? 'PASSED' : 'IN_PROGRESS',
          }
        : undefined,
    };

    this.accounts.set(accountId, acc);
    this.positions.set(accountId, positions);
    this.deals.set(accountId, deals);

    // Merge existing confluences into new logical trades so manual notes aren't lost
    const existingTrades = this.trades.get(accountId) || [];
    const confluencesByTicket = new Map<number, any>();
    for (const t of existingTrades) {
      if (t.confluences) {
        confluencesByTicket.set(t.primary_ticket, t.confluences);
      }
    }

    const mergedTrades = logicalTrades.map((t) => ({
      ...t,
      confluences: confluencesByTicket.get(t.primary_ticket) || t.confluences,
    }));

    this.trades.set(accountId, mergedTrades);
  }
}

export const inMemoryStore = new InMemoryStore();
