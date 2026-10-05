#!/usr/bin/env python3
"""
NOVA Intelligence OS - MetaTrader 5 Read-Only HTTP Bridge Service
Exposes authenticated, read-only REST endpoints for Node.js / Express backend synchronization.

STRICT SAFETY ENFORCEMENT:
- NO order placement, modification, closing, or trading execution functionality.
- Authenticates all incoming requests using MT5_BRIDGE_SECRET via X-MT5-Bridge-Key header.
- Fully compatible with standard Python 3.9+ without external web framework dependencies.
"""

import json
import logging
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlparse

try:
    from dotenv import load_dotenv
    load_dotenv()
    # Also load from parent directories if present
    parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(parent_env):
        load_dotenv(parent_env)
    backend_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
    if os.path.exists(backend_env):
        load_dotenv(backend_env)
except ImportError:
    pass

from connector import MT5Connector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [NOVA-MT5-Bridge] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("NOVA-MT5-Bridge")

# Configuration from Environment Variables
PORT = int(os.getenv("MT5_CONNECTOR_PORT") or os.getenv("PORT") or 5001)
HOST = os.getenv("MT5_CONNECTOR_HOST", "0.0.0.0")
MT5_BRIDGE_SECRET = os.getenv("MT5_BRIDGE_SECRET", "nova_mt5_bridge_secret_ld4")
NOVA_BACKEND_URL = os.getenv("NOVA_BACKEND_URL", "http://localhost:3000")

# Shared connector singleton
_connector: Optional[MT5Connector] = None


def get_connector() -> MT5Connector:
    global _connector
    if _connector is None:
        _connector = MT5Connector()
        try:
            _connector.initialize()
        except Exception as e:
            logger.warning(f"Could not connect to live MT5 terminal at startup: {e}")
    return _connector


class MT5BridgeRequestHandler(BaseHTTPRequestHandler):
    """
    HTTP request handler that enforces authentication and serves read-only MT5 telemetry.
    """

    server_version = "NOVA-MT5-Bridge/1.0.0"

    def _send_json_response(self, status_code: int, data: dict):
        response_bytes = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-MT5-Bridge-Key, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(response_bytes)

    def _authenticate(self) -> bool:
        """
        Validates X-MT5-Bridge-Key or Authorization Bearer header against MT5_BRIDGE_SECRET.
        """
        # Allow health checks without secret if configured, but enforce secret for data
        bridge_key = self.headers.get("X-MT5-Bridge-Key")
        auth_header = self.headers.get("Authorization", "")

        if not bridge_key and auth_header.startswith("Bearer "):
            bridge_key = auth_header.split(" ", 1)[1].strip()

        if not bridge_key:
            return False

        return bridge_key == MT5_BRIDGE_SECRET

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(HTTPStatus.OK)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-MT5-Bridge-Key, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path.rstrip("/")
        query_params = parse_qs(parsed_url.query)

        # 1. Health check endpoint (public probe)
        if path in ("", "/health", "/api/health"):
            connector = get_connector()
            self._send_json_response(
                HTTPStatus.OK,
                {
                    "status": "ONLINE",
                    "service": "NOVA MetaTrader 5 Python Bridge",
                    "mode": "READ_ONLY",
                    "mt5_connected": connector.is_connected,
                    "account_number": connector.login,
                    "server": connector.server,
                    "trading_disabled": True,
                    "security": "Enforced (X-MT5-Bridge-Key required for data)",
                },
            )
            return

        # Enforce authentication for all data endpoints
        if not self._authenticate():
            logger.warning(f"Unauthorized access attempt to {self.path} from {self.client_address[0]}")
            self._send_json_response(
                HTTPStatus.UNAUTHORIZED,
                {
                    "error": "UNAUTHORIZED",
                    "message": "Invalid or missing 'X-MT5-Bridge-Key' header. Access denied.",
                },
            )
            return

        connector = get_connector()

        # Ensure connector is initialized
        if not connector.is_connected:
            try:
                connector.initialize()
            except Exception as e:
                self._send_json_response(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {
                        "error": "MT5_UNAVAILABLE",
                        "message": f"MetaTrader 5 terminal is not available: {str(e)}",
                    },
                )
                return

        try:
            # 2. Account Information Snapshot
            if path in ("/account", "/api/account"):
                account_data = connector.get_account_snapshot()
                self._send_json_response(HTTPStatus.OK, {"success": True, "data": account_data})
                return

            # 3. Open Positions
            elif path in ("/positions", "/api/positions"):
                positions = connector.get_open_positions()
                self._send_json_response(
                    HTTPStatus.OK,
                    {"success": True, "count": len(positions), "data": positions},
                )
                return

            # 4. Historical Deals
            elif path in ("/deals", "/api/deals", "/history", "/api/history"):
                days = int(query_params.get("days", [connector.history_days])[0])
                deals = connector.get_recent_deals(days=days)
                self._send_json_response(
                    HTTPStatus.OK,
                    {"success": True, "count": len(deals), "days": days, "data": deals},
                )
                return

            # 5. Full Synchronization Payload (Expected by Node backend syncMT5Account)
            elif path in ("/sync", "/api/sync"):
                snapshot = connector.fetch_full_snapshot()
                # Return direct payload format matching MT5SyncPayload interface in TypeScript
                self._send_json_response(HTTPStatus.OK, snapshot)
                return

            else:
                self._send_json_response(
                    HTTPStatus.NOT_FOUND,
                    {"error": "NOT_FOUND", "message": f"Endpoint '{self.path}' does not exist."},
                )

        except Exception as e:
            logger.error(f"Error handling {path}: {e}")
            self._send_json_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "INTERNAL_ERROR", "message": str(e)},
            )

    def do_POST(self):
        """
        Reject any trading / order modification attempts.
        Only allows safe on-demand /push trigger to notify the Node backend.
        """
        parsed_url = urlparse(self.path)
        path = parsed_url.path.rstrip("/")

        # Check for prohibited trading actions
        if any(term in path.lower() for term in ("order", "trade", "buy", "sell", "close", "modify")):
            self._send_json_response(
                HTTPStatus.METHOD_NOT_ALLOWED,
                {
                    "error": "READ_ONLY_VIOLATION",
                    "message": "Order placement, modification, and closing are strictly prohibited by this read-only bridge.",
                },
            )
            return

        # Authenticate
        if not self._authenticate():
            self._send_json_response(
                HTTPStatus.UNAUTHORIZED,
                {"error": "UNAUTHORIZED", "message": "Invalid X-MT5-Bridge-Key"},
            )
            return

        # On-demand push webhook trigger to Node.js backend
        if path in ("/push", "/api/push"):
            try:
                import requests
                connector = get_connector()
                snapshot = connector.fetch_full_snapshot()
                webhook_url = f"{NOVA_BACKEND_URL.rstrip('/')}/api/connector/sync-webhook"
                resp = requests.post(
                    webhook_url,
                    json=snapshot,
                    headers={"X-MT5-Bridge-Key": MT5_BRIDGE_SECRET},
                    timeout=10,
                )
                self._send_json_response(
                    HTTPStatus.OK,
                    {
                        "success": resp.status_code == 200,
                        "backend_status": resp.status_code,
                        "pushed_to": webhook_url,
                    },
                )
            except Exception as e:
                self._send_json_response(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"success": False, "error": str(e)},
                )
            return

        self._send_json_response(
            HTTPStatus.METHOD_NOT_ALLOWED,
            {
                "error": "METHOD_NOT_ALLOWED",
                "message": "This MT5 connector service is strictly read-only.",
            },
        )

    def do_PUT(self):
        self._send_json_response(
            HTTPStatus.METHOD_NOT_ALLOWED,
            {"error": "READ_ONLY_VIOLATION", "message": "Modification operations are disabled."},
        )

    def do_DELETE(self):
        self._send_json_response(
            HTTPStatus.METHOD_NOT_ALLOWED,
            {"error": "READ_ONLY_VIOLATION", "message": "Deletion/cancellation operations are disabled."},
        )

    def log_message(self, format, *args):
        # Clean logging
        logger.info(f"{self.client_address[0]} - {format % args}")


def start_server():
    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, MT5BridgeRequestHandler)
    print("=" * 72)
    print("  NOVA INTELLIGENCE OS — METATRADER 5 PYTHON BRIDGE (READ-ONLY)")
    print("=" * 72)
    print(f"  • Bridge Server Listening: http://{HOST}:{PORT}")
    print(f"  • MT5 Bridge Secret:       {'Configured (Active)' if MT5_BRIDGE_SECRET else 'Default'}")
    print(f"  • Read-Only Endpoints:     /health, /account, /positions, /deals, /sync")
    print(f"  • Safety Mode:             100% Read-Only (Order execution disabled)")
    print("=" * 72)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down MT5 Bridge Server...")
    finally:
        httpd.server_close()
        if _connector:
            _connector.shutdown()
        print("[*] Server stopped cleanly.")


if __name__ == "__main__":
    start_server()
