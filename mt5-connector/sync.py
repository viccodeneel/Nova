#!/usr/bin/env python3
"""
NOVA Intelligence OS - MT5 Synchronization & Bridge Runner
Executes:
1. HTTP REST Bridge Server: python sync.py --server --port 8000
2. Periodic Push Polling:   python sync.py --watch --interval 10
3. One-Shot Push Sync:      python sync.py --once
"""

import argparse
import os
import sys
import time
from datetime import datetime

try:
    import requests
    from dotenv import load_dotenv

    # Load environment files
    load_dotenv()
    parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(parent_env):
        load_dotenv(parent_env)
    backend_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
    if os.path.exists(backend_env):
        load_dotenv(backend_env)
except ImportError:
    print("[ERROR] Missing required packages. Run: pip install -r requirements.txt")
    sys.exit(1)

from connector import MT5Connector

NOVA_BACKEND_URL = os.getenv("NOVA_BACKEND_URL", "http://localhost:3000")
MT5_LOGIN = os.getenv("MT5_LOGIN")
MT5_PASSWORD = os.getenv("MT5_PASSWORD")
MT5_SERVER = os.getenv("MT5_SERVER")
MT5_PATH = os.getenv("MT5_PATH")
MT5_BRIDGE_SECRET = os.getenv("MT5_BRIDGE_SECRET", "nova_mt5_bridge_secret_ld4")
DEFAULT_INTERVAL = int(os.getenv("SYNC_INTERVAL_SECONDS", "10"))


def push_to_nova_backend(payload: dict) -> bool:
    """
    Transmits the MT5 snapshot to the NOVA Node.js/Express backend webhook.
    """
    url = f"{NOVA_BACKEND_URL.rstrip('/')}/api/connector/sync-webhook"
    headers = {
        "Content-Type": "application/json",
        "X-MT5-Bridge-Key": MT5_BRIDGE_SECRET,
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            result = response.json()
            account_num = payload.get("account", {}).get("account_number")
            balance = payload.get("account", {}).get("balance")
            positions = len(payload.get("positions", []))
            deals = len(payload.get("deals", []))
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] [SYNC SUCCESS] Account #{account_num} "
                f"| Balance: ${balance:,.2f} | Positions: {positions} | Deals Synced: {deals}"
            )
            return True
        else:
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] [SYNC REJECTED] Status {response.status_code}: {response.text}"
            )
            return False
    except requests.exceptions.RequestException as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [CONNECTION ERROR] Failed to reach NOVA Backend at {url}: {e}")
        return False


def run_sync_cycle(connector: MT5Connector) -> bool:
    try:
        snapshot = connector.fetch_full_snapshot()
        return push_to_nova_backend(snapshot)
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] Exception during MT5 snapshot: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="NOVA MT5 Synchronization & Bridge Service")
    parser.add_argument("--server", action="store_true", help="Launch HTTP REST Bridge Server for backend pull queries")
    parser.add_argument("--port", type=int, default=int(os.getenv("MT5_CONNECTOR_PORT") or os.getenv("PORT") or 8000), help="Bridge server port (default: 8000)")
    parser.add_argument("--once", action="store_true", help="Perform a single sync push and exit")
    parser.add_argument("--watch", action="store_true", help="Run continuously in polling watch mode")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help="Polling interval in seconds")
    parser.add_argument("--login", type=int, default=int(MT5_LOGIN) if MT5_LOGIN else None, help="MT5 Account Number")
    parser.add_argument("--password", type=str, default=MT5_PASSWORD, help="MT5 Password (Investor or Master)")
    parser.add_argument("--server-name", type=str, default=MT5_SERVER, help="MT5 Broker Server Name")
    parser.add_argument("--path", type=str, default=MT5_PATH, help="Path to terminal64.exe")

    args = parser.parse_args()

    # If --server mode requested, run the HTTP REST microservice
    if args.server:
        os.environ["PORT"] = str(args.port)
        from bridge_server import start_server
        start_server()
        return

    # Check credentials for CLI push modes
    login = args.login or (int(MT5_LOGIN) if MT5_LOGIN else None)
    password = args.password or MT5_PASSWORD
    server_name = args.server_name or MT5_SERVER

    if not login or not password or not server_name:
        print("=" * 70)
        print("  NOVA INTELLIGENCE OS — MT5 CONNECTOR")
        print("=" * 70)
        print("[!] Missing MT5 Credentials. Please configure them via environment variables:")
        print("    MT5_LOGIN=<account_number>")
        print("    MT5_PASSWORD=<read_only_investor_password>")
        print("    MT5_SERVER=<broker_server_name>")
        print("Or run the HTTP Bridge Server:")
        print("    python sync.py --server --port 8000")
        print("=" * 70)
        sys.exit(1)

    print(f"[*] Initializing MT5 connection to account #{login} on '{server_name}'...")

    connector = MT5Connector(
        login=login,
        password=password,
        server=server_name,
        path=args.path,
    )

    try:
        connector.initialize()
        print("[+] MetaTrader 5 Terminal initialized & authenticated successfully.")

        if args.once or not args.watch:
            print("[*] Running one-shot synchronization...")
            success = run_sync_cycle(connector)
            sys.exit(0 if success else 1)
        else:
            print(f"[*] Starting continuous watch loop (Interval: {args.interval}s). Press Ctrl+C to stop.")
            while True:
                run_sync_cycle(connector)
                time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\n[*] Stopping MT5 sync service...")
    except Exception as e:
        print(f"[FATAL] Could not connect to MetaTrader 5: {e}")
        sys.exit(1)
    finally:
        connector.shutdown()
        print("[*] MT5 connection closed.")


if __name__ == "__main__":
    main()
