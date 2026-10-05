export interface MT5AccountSnapshot {
  account_number: number;
  broker_name: string;
  server_name: string;
  balance: number;
  equity: number;
  credit?: number;
  margin?: number;
  free_margin?: number;
  margin_level?: number;
  currency?: string;
  leverage?: number;
  connection_status?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
}

export interface MT5PositionSnapshot {
  position_ticket: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  current_price: number;
  stop_loss?: number;
  take_profit?: number;
  current_profit: number;
  swap?: number;
  commission?: number;
  opened_at: string;
  magic_number?: number;
  comment?: string;
}

export interface MT5DealSnapshot {
  deal_ticket: number;
  order_ticket?: number;
  position_id: number;
  symbol: string;
  entry_type: 'IN' | 'OUT' | 'INOUT';
  direction: 'BUY' | 'SELL';
  volume: number;
  price: number;
  profit: number;
  commission?: number;
  swap?: number;
  fee?: number;
  deal_time: string;
  magic_number?: number;
  comment?: string;
}

export interface MT5SyncPayload {
  account: MT5AccountSnapshot;
  positions: MT5PositionSnapshot[];
  deals: MT5DealSnapshot[];
  timestamp?: string;
}

export interface LogicalTrade {
  id: string;
  trading_account_id: string;
  position_id: number;
  primary_ticket: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  entry_price: number;
  exit_price?: number;
  stop_loss?: number;
  take_profit?: number;
  gross_profit: number;
  commission: number;
  swap: number;
  net_profit: number;
  r_multiple: number;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN';
  session_window?: string;
  hold_duration?: string;
  opened_at: string;
  closed_at?: string;
  comment?: string;
  magic_number?: number;
  is_closed: boolean;
  confluences?: TradeConfluences;
}

export interface TradeConfluences {
  id?: string;
  trade_id?: string;
  bias_1h?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  liquidity_sweep_confirmed?: boolean;
  liquidity_pool_level?: string;
  bos_displacement_confirmed?: boolean;
  fvg_retest_confirmed?: boolean;
  orderblock_mitigated?: boolean;
  smt_divergence_present?: boolean;
  tape_absorption_confirmed?: boolean;
  rules_followed_count?: number;
  total_rules_count?: number;
  discipline_score?: number;
  early_entry_flag?: boolean;
  fomo_flag?: boolean;
  revenge_trade_flag?: boolean;
  setup_quality?: string;
  notes?: string;
}

export interface PropFirmConfig {
  id?: string;
  trading_account_id: string;
  prop_firm_name: string;
  program_name: string;
  max_loss_percent: number;
  max_loss_limit: number;
  daily_loss_percent: number;
  daily_loss_limit: number;
  current_daily_drawdown: number;
  current_max_drawdown: number;
  peak_watermark: number;
  breach_status: 'SAFE' | 'CAUTION' | 'BREACHED';
}

export interface PropPhaseConfig {
  id?: string;
  prop_firm_account_id?: string;
  phase_name: string;
  starting_balance: number;
  profit_target_percent: number;
  profit_target_amount: number;
  pass_threshold: number;
  minimum_trading_days: number;
  current_trading_days: number;
  current_profit: number;
  progress_percentage: number;
  remaining_target: number;
  phase_status: 'IN_PROGRESS' | 'PASSED' | 'FAILED';
}

export interface TradingAccountRecord {
  id: string;
  user_id?: string;
  account_name: string;
  account_number: number;
  broker_name: string;
  server_name: string;
  account_type: string;
  currency: string;
  leverage: number;
  starting_balance: number;
  current_balance: number;
  current_equity: number;
  credit: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  connection_status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  bridge_protocol: string;
  is_active: boolean;
  last_synced_at?: string;
  prop_firm?: PropFirmConfig;
  prop_phase?: PropPhaseConfig;
  positions_count?: number;
  trades_count?: number;
}
