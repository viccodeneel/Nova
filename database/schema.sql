-- ============================================================================
-- NOVA Intelligence OS: PostgreSQL Database Schema
-- Production-ready schema for MT5 Account Sync, Prop-Firm Risk & Trade Journal
-- Compatible with Supabase PostgreSQL, AWS RDS, Cloud SQL, and Local Postgres
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. USERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(150),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'trader',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. TRADING ACCOUNTS (MetaTrader 5 Connected Accounts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trading_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    account_number BIGINT NOT NULL,
    broker_name VARCHAR(100) NOT NULL,
    server_name VARCHAR(150) NOT NULL,
    account_type VARCHAR(50) DEFAULT 'evaluation', -- evaluation, funded, live_personal, demo
    currency VARCHAR(10) DEFAULT 'USD',
    leverage INT DEFAULT 100,
    starting_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
    current_equity NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
    credit NUMERIC(15, 2) DEFAULT 0.00,
    margin NUMERIC(15, 2) DEFAULT 0.00,
    free_margin NUMERIC(15, 2) DEFAULT 10000.00,
    margin_level NUMERIC(10, 2) DEFAULT 0.00,
    connection_status VARCHAR(30) DEFAULT 'DISCONNECTED', -- CONNECTED, DISCONNECTED, ERROR
    mt5_data_verified BOOLEAN NOT NULL DEFAULT FALSE,
    bridge_protocol VARCHAR(50) DEFAULT 'PYTHON_CONNECTOR', -- PYTHON_CONNECTOR, EA_WEBHOOK, REST_GATEWAY
    is_active BOOLEAN DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_broker_number UNIQUE (account_number, server_name)
);

-- Legacy accounts remain hidden until a real MT5 snapshot verifies them.
ALTER TABLE trading_accounts
    ADD COLUMN IF NOT EXISTS mt5_data_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 3. PROP FIRM ACCOUNTS (Configuration & Rule Sets)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prop_firm_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trading_account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE,
    prop_firm_name VARCHAR(100) NOT NULL, -- FundingPips, FTMO, Topstep, Alpha Capital, Custom
    program_name VARCHAR(100) DEFAULT 'Standard Evaluation',
    max_loss_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    max_loss_limit NUMERIC(15, 2) NOT NULL DEFAULT 1000.00,
    daily_loss_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    daily_loss_limit NUMERIC(15, 2) NOT NULL DEFAULT 500.00,
    current_daily_drawdown NUMERIC(15, 2) DEFAULT 0.00,
    current_max_drawdown NUMERIC(15, 2) DEFAULT 0.00,
    peak_watermark NUMERIC(15, 2) NOT NULL DEFAULT 10000.00,
    breach_status VARCHAR(30) DEFAULT 'SAFE', -- SAFE, CAUTION, BREACHED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. PROP PHASES (Evaluation Phase 1, Phase 2, Funded Master)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prop_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prop_firm_account_id UUID REFERENCES prop_firm_accounts(id) ON DELETE CASCADE,
    phase_name VARCHAR(50) NOT NULL, -- Phase 1 Evaluation, Phase 2 Evaluation, Funded Master
    phase_order INT DEFAULT 1,
    starting_balance NUMERIC(15, 2) NOT NULL,
    profit_target_percent NUMERIC(5, 2) NOT NULL DEFAULT 6.00,
    profit_target_amount NUMERIC(15, 2) NOT NULL,
    pass_threshold NUMERIC(15, 2) NOT NULL,
    minimum_trading_days INT DEFAULT 0,
    current_trading_days INT DEFAULT 0,
    current_profit NUMERIC(15, 2) DEFAULT 0.00,
    progress_percentage NUMERIC(5, 2) DEFAULT 0.00,
    remaining_target NUMERIC(15, 2) DEFAULT 0.00,
    phase_status VARCHAR(30) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, PASSED, FAILED
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. MT5 OPEN POSITIONS (Live Open Trades from MT5 terminal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mt5_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trading_account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE,
    position_ticket BIGINT NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- BUY, SELL
    volume NUMERIC(10, 2) NOT NULL,
    open_price NUMERIC(15, 5) NOT NULL,
    current_price NUMERIC(15, 5) NOT NULL,
    stop_loss NUMERIC(15, 5),
    take_profit NUMERIC(15, 5),
    current_profit NUMERIC(15, 2) DEFAULT 0.00,
    swap NUMERIC(15, 2) DEFAULT 0.00,
    commission NUMERIC(15, 2) DEFAULT 0.00,
    magic_number BIGINT DEFAULT 0,
    comment TEXT,
    opened_at TIMESTAMPTZ NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_position UNIQUE (trading_account_id, position_ticket)
);

-- ----------------------------------------------------------------------------
-- 6. MT5 RAW DEALS (Individual MT5 execution deals, in/out)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mt5_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trading_account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE,
    deal_ticket BIGINT NOT NULL,
    order_ticket BIGINT,
    position_id BIGINT NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    entry_type VARCHAR(20) NOT NULL, -- IN, OUT, INOUT
    direction VARCHAR(10) NOT NULL,  -- BUY, SELL
    volume NUMERIC(10, 2) NOT NULL,
    price NUMERIC(15, 5) NOT NULL,
    profit NUMERIC(15, 2) DEFAULT 0.00,
    commission NUMERIC(15, 2) DEFAULT 0.00,
    swap NUMERIC(15, 2) DEFAULT 0.00,
    fee NUMERIC(15, 2) DEFAULT 0.00,
    magic_number BIGINT DEFAULT 0,
    comment TEXT,
    deal_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_deal UNIQUE (trading_account_id, deal_ticket)
);

-- ----------------------------------------------------------------------------
-- 7. LOGICAL TRADES (Aggregated Trades for NOVA Journal & Analytics)
-- One logical trade may correlate to multiple MT5 deals (e.g. entry + exit or partial scale)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trading_account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE,
    position_id BIGINT,
    primary_ticket BIGINT NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- BUY, SELL
    volume NUMERIC(10, 2) NOT NULL,
    entry_price NUMERIC(15, 5) NOT NULL,
    exit_price NUMERIC(15, 5),
    stop_loss NUMERIC(15, 5),
    take_profit NUMERIC(15, 5),
    gross_profit NUMERIC(15, 2) DEFAULT 0.00,
    commission NUMERIC(15, 2) DEFAULT 0.00,
    swap NUMERIC(15, 2) DEFAULT 0.00,
    net_profit NUMERIC(15, 2) DEFAULT 0.00,
    r_multiple NUMERIC(6, 2) DEFAULT 0.00,
    outcome VARCHAR(20) DEFAULT 'WIN', -- WIN, LOSS, BREAKEVEN, OPEN
    session_window VARCHAR(50) DEFAULT 'London / NY Overlap',
    hold_duration VARCHAR(50),
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    comment TEXT,
    magic_number BIGINT DEFAULT 0,
    is_closed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_trade_ticket UNIQUE (trading_account_id, primary_ticket)
);

-- ----------------------------------------------------------------------------
-- 8. TRADE CONFLUENCES (User-entered DLM Setup and Checklist Parameters)
-- Kept separate from raw MT5 sync because MT5 does not know trader's bias/rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trade_confluences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE UNIQUE,
    bias_1h VARCHAR(50), -- BULLISH, BEARISH, NEUTRAL
    liquidity_sweep_confirmed BOOLEAN DEFAULT FALSE,
    liquidity_pool_level VARCHAR(100),
    bos_displacement_confirmed BOOLEAN DEFAULT FALSE,
    fvg_retest_confirmed BOOLEAN DEFAULT FALSE,
    orderblock_mitigated BOOLEAN DEFAULT FALSE,
    smt_divergence_present BOOLEAN DEFAULT FALSE,
    tape_absorption_confirmed BOOLEAN DEFAULT FALSE,
    rules_followed_count INT DEFAULT 0,
    total_rules_count INT DEFAULT 6,
    discipline_score INT DEFAULT 100, -- 0 to 100%
    early_entry_flag BOOLEAN DEFAULT FALSE,
    fomo_flag BOOLEAN DEFAULT FALSE,
    revenge_trade_flag BOOLEAN DEFAULT FALSE,
    setup_quality VARCHAR(50) DEFAULT 'A+ DLM Sweep',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 9. TRADE SCREENSHOTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trade_screenshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
    timeframe VARCHAR(20) DEFAULT 'M1', -- M1, M5, M15, 1H, 4H, Daily
    title VARCHAR(150),
    image_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- INDEXES FOR HIGH-FREQUENCY TELEMETRY QUERIES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trading_accounts_user ON trading_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_active ON trading_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_prop_firm_accounts_account ON prop_firm_accounts(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_prop_phases_account ON prop_phases(prop_firm_account_id);
CREATE INDEX IF NOT EXISTS idx_mt5_positions_account ON mt5_positions(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_mt5_deals_account_time ON mt5_deals(trading_account_id, deal_time DESC);
CREATE INDEX IF NOT EXISTS idx_mt5_deals_position ON mt5_deals(position_id);
CREATE INDEX IF NOT EXISTS idx_trades_account_time ON trades(trading_account_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_outcome ON trades(outcome);
CREATE INDEX IF NOT EXISTS idx_trade_confluences_trade ON trade_confluences(trade_id);


-- Net worth tracker (manual entries)
CREATE TABLE IF NOT EXISTS finance_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('asset','liability')),
    category VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL,
    value NUMERIC(18,2) NOT NULL CHECK (value >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
