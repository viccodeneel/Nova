# Windows Setup & Operating Guide: MetaTrader 5 Python Bridge

This guide provides end-to-end instructions for running the **NOVA MetaTrader 5 Read-Only Connector** on a Windows workstation or Windows VPS.

---

## 1. System Requirements

- **Operating System:** Windows 10, Windows 11, or Windows Server 2019/2022 (64-bit)
- **Python:** Python 3.9, 3.10, 3.11, or 3.12 (**64-bit required**)
  - *Important:* Ensure you check **"Add python.exe to PATH"** in the Python installer.
- **MetaTrader 5 Desktop:** Installed and logged into your broker or prop-firm trading account.

---

## 2. Zero-Trust Security Configuration

### Use the MT5 "Investor Password" (Read-Only)
For prop-firm evaluation accounts (FundingPips, FTMO, Topstep) and personal live accounts:
1. In your broker dashboard, copy your **Investor Password** (also referred to as *Read-Only Password*).
2. The connector only needs to inspect balances, equity, open positions, and historical deals.
3. Even if your workstation were compromised, an Investor Password prevents any trades or modifications from ever executing at the broker level.
4. Furthermore, the connector code **contains zero trade execution or order-sending methods**.

---

## 3. Installation Steps

### Step 1: Open PowerShell or Command Prompt
Navigate to the `mt5-connector` folder:
```powershell
cd path\to\mt5-connector
```

### Step 2: Create a Python Virtual Environment (Recommended)
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```
*(If PowerShell blocks script execution, run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

### Step 3: Install Required Packages
```powershell
pip install -r requirements.txt
```
This installs the official `MetaTrader5` package, `requests`, and `python-dotenv`.

---

## 4. Environment Configuration

Create a `.env` file inside `mt5-connector/`:
```env
# Must match MT5_BRIDGE_SECRET configured on the Render service
MT5_BRIDGE_SECRET="<RENDER_MT5_BRIDGE_SECRET>"

# NOVA service and dashboard origins; origins have no paths
NOVA_BACKEND_URL="https://your-render-service.onrender.com"
NOVA_FRONTEND_ORIGINS="https://your-render-service.onrender.com,https://viccodeneel.github.io"

# Local read-only bridge listener
MT5_CONNECTOR_HOST=127.0.0.1
MT5_CONNECTOR_PORT=5001
MT5_SIMULATION_MODE=false
HISTORY_DAYS=30

# Optional path if MT5 is installed in a non-standard path:
# MT5_PATH="C:\\Program Files\\MetaTrader 5\\terminal64.exe"
```

Do not put `MT5_LOGIN` or `MT5_PASSWORD` in `.env`. Enter your MT5 login, server name, and Investor Password in NOVA's **Accounts → Add Account** form. The password is sent to this computer's local connector and is kept in memory only while the connector is running.
---

## 5. Starting the Connector Service

You can run the connector in either of two modes:

### Mode A: HTTP REST Bridge Server (Recommended)
This launches the local read-only connector on port 5001. Keep it running, then use **Accounts → Add Account** in NOVA and enter your MT5 login, server, and Investor Password:
```powershell
python bridge_server.py
```
*Alternative command:*
```powershell
python sync.py --server --port 5001
```

Expected output:
```text
========================================================================
  NOVA INTELLIGENCE OS — METATRADER 5 PYTHON BRIDGE (READ-ONLY)
========================================================================
  • Bridge Server Listening: http://127.0.0.1:5001
  • MT5 Bridge Secret:       Configured (Active)
  • Read-Only Endpoints:     /health, /account, /positions, /deals, /sync, /connect
  • Safety Mode:             100% Read-Only (Order execution disabled)
========================================================================
```

---

### Mode B: Automatic Polling Watcher
In this mode, the Python script actively monitors MT5 and pushes account snapshots to the NOVA backend webhook every 10 seconds:
```powershell
python sync.py --watch --interval 10
```

---

### Mode C: One-Shot Sync Push
Executes a single telemetry extraction, uploads to NOVA, and exits:
```powershell
python sync.py --once
```

---

## 6. Verifying the Endpoints (PowerShell / Curl)

In a separate PowerShell window, test that the service is running and properly authenticated:

### 1. Public Health Check
```powershell
curl http://localhost:5001/health
```
Response:
```json
{
  "status": "ONLINE",
  "service": "NOVA MetaTrader 5 Python Bridge",
  "mode": "READ_ONLY",
  "mt5_connected": true,
  "trading_disabled": true
}
```

### 2. Verify Authentication Rejection (Missing Header)
```powershell
curl http://localhost:5001/account
```
Response:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing 'X-MT5-Bridge-Key' header. Access denied."
}
```

### 3. Query Account Snapshot (Authenticated)
```powershell
curl -H "X-MT5-Bridge-Key: <GENERATE_A_NEW_BRIDGE_SECRET>" http://localhost:5001/account
```

### 4. Query Open Positions (Authenticated)
```powershell
curl -H "X-MT5-Bridge-Key: <GENERATE_A_NEW_BRIDGE_SECRET>" http://localhost:5001/positions
```

### 5. Query Historical Deals (Authenticated)
```powershell
curl -H "X-MT5-Bridge-Key: <GENERATE_A_NEW_BRIDGE_SECRET>" http://localhost:5001/deals?days=30
```

### 6. Query Full Sync Payload
```powershell
curl -H "X-MT5-Bridge-Key: <GENERATE_A_NEW_BRIDGE_SECRET>" http://localhost:5001/sync
```

---

## 7. Running as a Background Windows Service

To keep the MT5 Bridge running continuously on your trading machine:

### Option A: Windows Task Scheduler
1. Press `Win + R`, type `taskschd.msc`, and press Enter.
2. Click **Create Basic Task...** and name it `NOVA MT5 Bridge`.
3. Set Trigger to **When I log on**.
4. Set Action to **Start a program**:
   - Program/script: `C:\path\to\mt5-connector\venv\Scripts\python.exe`
   - Add arguments: `bridge_server.py`
   - Start in: `C:\path\to\mt5-connector`
5. Finish and test run the task.

### Option B: Using NSSM (Non-Sucking Service Manager)
```powershell
nssm install NovaMt5Bridge "C:\path\to\mt5-connector\venv\Scripts\python.exe" "bridge_server.py"
nssm set NovaMt5Bridge AppDirectory "C:\path\to\mt5-connector"
nssm start NovaMt5Bridge
```

---

## 8. Common Troubleshooting

| Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `mt5.initialize() failed: [-10003]` | MT5 Desktop is not running or path is incorrect | Open MetaTrader 5 Desktop terminal before starting the script, or set `MT5_PATH` in `.env`. |
| `Failed to log into MT5 Account [-2]` | Invalid login, password, or server name | Verify server name matches the exact name in your MT5 login dialog (e.g., `FundingPips-Server`). |
| `No module named MetaTrader5` | Python 32-bit was installed instead of 64-bit | Reinstall Python with the **64-bit installer (x86-64)** from python.org. |
| `X-MT5-Bridge-Key Unauthorized` | Mismatch between Python and Node backend secrets | Ensure `MT5_BRIDGE_SECRET` matches exactly in both `mt5-connector/.env` and `backend/.env`. |
