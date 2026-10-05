# NOVA MetaTrader 5 Python Connector Service

The **MT5 Connector Service** is a lightweight, read-only Python bridge service that interfaces directly with an active MetaTrader 5 Desktop terminal on your local trading workstation and synchronizes real-time account telemetry, open positions, and completed trade history into the NOVA PostgreSQL database.

---

## Architecture

```
[MetaTrader 5 Desktop Terminal (Windows 64-bit)]
                     ↕ (Official IPC)
[mt5-connector/bridge_server.py (Read-Only REST API)]
    • GET /health
    • GET /account    (Authenticated with X-MT5-Bridge-Key)
    • GET /positions  (Authenticated with X-MT5-Bridge-Key)
    • GET /deals      (Authenticated with X-MT5-Bridge-Key)
    • GET /sync       (Authenticated with X-MT5-Bridge-Key)
                     ↕ (HTTP REST / Signed Header)
[NOVA Express / Node.js Backend]
                     ↓ (Idempotent Deal Aggregation & Upsert)
[PostgreSQL Database (Supabase / Cloud SQL)]
                     ↓ (Live Reactive Stream)
[NOVA React Dashboard & Trade Journal]
```

---

## Security Governance & Safety Enforcements

1. **Strictly Read-Only Guarantee**:
   - The connector only queries `mt5.account_info()`, `mt5.positions_get()`, and `mt5.history_deals_get()`.
   - Trade placement, order modification, closing, and cancellation functions (`order_send`, `order_check`, etc.) are **strictly omitted and prohibited**.
   - Any HTTP `POST`, `PUT`, or `DELETE` attempt targeting trading routes returns `HTTP 405 Method Not Allowed`.

2. **Investor Password Compatible**:
   - Recommended to authenticate using your broker's read-only **Investor Password**. This guarantees at the broker server level that no orders can be placed.

3. **Pre-Shared Bridge Authentication**:
   - All communications are gated by the `X-MT5-Bridge-Key` HTTP header, verified against `MT5_BRIDGE_SECRET`. Unauthorized requests are rejected with `HTTP 401`.

---

## Read-Only Endpoints

| Method | Path | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Service status, MT5 connection state, account number, server |
| `GET` | `/account` | Yes (`X-MT5-Bridge-Key`) | Balance, equity, credit, margin, free margin, leverage |
| `GET` | `/positions`| Yes (`X-MT5-Bridge-Key`) | Array of active open positions (ticket, symbol, price, P&L) |
| `GET` | `/deals` | Yes (`X-MT5-Bridge-Key`) | Historical closed deals (accepts `?days=30`) |
| `GET` | `/sync` | Yes (`X-MT5-Bridge-Key`) | Full snapshot payload for Node.js `syncMT5Account()` |
| `POST`| `/push` | Yes (`X-MT5-Bridge-Key`) | On-demand trigger to push snapshot to NOVA webhook |

---

## Quickstart

### 1. Prerequisites
- Windows 10/11 or Windows Server (64-bit)
- Python 3.9+ 64-bit
- MetaTrader 5 Desktop terminal installed and running

### 2. Installation
```bash
cd mt5-connector
pip install -r requirements.txt
```

### 3. Configuration
Create `.env` in `mt5-connector/`:
```env
MT5_LOGIN=884192
MT5_PASSWORD="YourInvestorPassword"
MT5_SERVER="FundingPips-Server"
MT5_BRIDGE_SECRET="9f870cd5bcde8adaf5d90eb1b7debaeae11da2e6168d1dc700d90ae44b081be8"
MT5_CONNECTOR_PORT=8000
NOVA_BACKEND_URL="http://localhost:3000"
```

### 4. Running the Service
```bash
# Start the HTTP Bridge Server (Recommended)
python bridge_server.py

# Or run via runner
python sync.py --server --port 8000
```

For complete step-by-step Windows setup, Windows Task Scheduler configuration, and troubleshooting, see [SETUP_WINDOWS.md](./SETUP_WINDOWS.md).
