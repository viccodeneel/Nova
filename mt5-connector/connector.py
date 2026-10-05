"""
NOVA Intelligence OS - MetaTrader 5 Desktop Terminal Connector
Official MetaTrader5 Python Bridge (Strictly Read-Only)

SECURITY & SAFETY GOVERNANCE:
- This service is STRICTLY READ-ONLY.
- Trade placement, order modification, position closing, and order cancellation
  are deliberately omitted and prohibited by design.
- Designed to work seamlessly with an MT5 Read-Only Investor Password for zero-trust security.
- Communicates directly with the locally installed MetaTrader 5 desktop terminal via IPC.
"""

import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("NOVA-MT5-Connector")

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False


class MT5Connector:
    """
    Direct interface to an active MetaTrader 5 Desktop terminal process on Windows.
    Safely retrieves account telemetry, open positions, and historical deals.
    NO order placement or execution capabilities exist in this module.
    """

    def __init__(
        self,
        login: Optional[int] = None,
        password: Optional[str] = None,
        server: Optional[str] = None,
        path: Optional[str] = None,
        history_days: Optional[int] = None,
        simulation_mode: Optional[bool] = None,
    ):
        # Read from arguments or environment variables
        configured_login = login if login is not None else os.getenv("MT5_LOGIN")
        self.login = int(configured_login) if configured_login else None
        self.password = str(password if password is not None else os.getenv("MT5_PASSWORD", ""))
        self.server = str(server if server is not None else os.getenv("MT5_SERVER", ""))
        self.path = path or os.getenv("MT5_PATH") or None
        self.history_days = int(history_days if history_days is not None else os.getenv("HISTORY_DAYS", "30"))
        self.portable = os.getenv("MT5_PORTABLE", "false").lower() in ("true", "1", "yes")

        # Check if running in simulation / dev test mode (e.g. on Linux/macOS or CI test)
        if simulation_mode is not None:
            self.simulation_mode = simulation_mode
        else:
            self.simulation_mode = os.getenv("MT5_SIMULATION_MODE", "false").lower() in ("true", "1", "yes")

        self._is_initialized = False
        self._last_error: Optional[str] = None

    @property
    def is_connected(self) -> bool:
        return self._is_initialized

    def initialize(self) -> bool:
        """
        Initializes IPC link to MetaTrader 5 Desktop Terminal and authenticates account.
        """
        if self.simulation_mode:
            logger.info(
                "[SIMULATION MODE] Initialized virtual MT5 connector; data is synthetic"
            )
            self._is_initialized = True
            return True

        if not self.login or not self.password or not self.server:
            raise ValueError("MT5_LOGIN, MT5_PASSWORD, and MT5_SERVER must be configured before connecting.")

        if not MT5_AVAILABLE:
            error_msg = (
                "The 'MetaTrader5' Python package is not installed or current OS is non-Windows. "
                "The official MetaTrader 5 library requires Windows 64-bit and an installed terminal. "
                "Set MT5_SIMULATION_MODE=true for testing without a local MT5 terminal."
            )
            self._last_error = error_msg
            logger.error(error_msg)
            raise RuntimeError(error_msg)

        init_args: Dict[str, Any] = {}
        if self.path:
            init_args["path"] = self.path
        if self.portable:
            init_args["portable"] = True

        # 1. Initialize terminal connection
        if not mt5.initialize(**init_args):
            err_code, err_desc = mt5.last_error()
            self._last_error = f"mt5.initialize() failed: [{err_code}] {err_desc}"
            logger.error(self._last_error)
            raise ConnectionError(
                f"{self._last_error}. Ensure MetaTrader 5 Desktop is installed and running."
            )

        # 2. Authenticate into specified trading account
        authorized = mt5.login(
            login=self.login,
            password=self.password,
            server=self.server,
        )

        if not authorized:
            err_code, err_desc = mt5.last_error()
            mt5.shutdown()
            self._last_error = f"Failed to log into MT5 Account #{self.login} on '{self.server}': [{err_code}] {err_desc}"
            logger.error(self._last_error)
            raise PermissionError(self._last_error)

        self._is_initialized = True
        logger.info(f"Successfully authenticated to MetaTrader 5 terminal: Account #{self.login} [{self.server}]")
        return True

    def get_account_snapshot(self) -> Dict[str, Any]:
        """
        Retrieves real-time account capital, balance, equity, and margin levels.
        Strictly read-only query using mt5.account_info().
        """
        if not self._is_initialized:
            raise RuntimeError("MT5Connector is not initialized. Call initialize() first.")

        if self.simulation_mode:
            return {
                "account_number": self.login,
                "broker_name": self.server.split("-")[0] if "-" in self.server else "FundingPips",
                "server_name": self.server,
                "balance": 10000.00,
                "equity": 10000.00,
                "credit": 0.00,
                "margin": 0.00,
                "free_margin": 10000.00,
                "margin_level": 0.00,
                "currency": "USD",
                "leverage": 100,
                "connection_status": "SIMULATED",
                "data_mode": "SIMULATED",
            }

        account_info = mt5.account_info()
        if account_info is None:
            err_code, err_desc = mt5.last_error()
            raise RuntimeError(f"Failed to query mt5.account_info(): [{err_code}] {err_desc}")

        info = account_info._asdict()

        return {
            "account_number": int(info.get("login", self.login)),
            "broker_name": str(info.get("company", "MetaTrader 5 Broker")),
            "server_name": str(info.get("server", self.server)),
            "balance": float(info.get("balance", 0.0)),
            "equity": float(info.get("equity", 0.0)),
            "credit": float(info.get("credit", 0.0)),
            "margin": float(info.get("margin", 0.0)),
            "free_margin": float(info.get("margin_free", 0.0)),
            "margin_level": float(info.get("margin_level", 0.0)),
            "currency": str(info.get("currency", "USD")),
            "leverage": int(info.get("leverage", 100)),
            "connection_status": "CONNECTED",
            "data_mode": "MT5",
        }

    def get_open_positions(self) -> List[Dict[str, Any]]:
        """
        Retrieves all currently active open positions in the terminal.
        Strictly read-only query using mt5.positions_get().
        """
        if not self._is_initialized:
            raise RuntimeError("MT5Connector is not initialized. Call initialize() first.")

        if self.simulation_mode:
            return []

        positions = mt5.positions_get()
        if positions is None:
            return []

        formatted: List[Dict[str, Any]] = []
        for pos in positions:
            p = pos._asdict()
            direction = "BUY" if p.get("type", 0) == 0 else "SELL"
            open_time = datetime.fromtimestamp(p.get("time", 0), tz=timezone.utc).isoformat()

            formatted.append({
                "position_ticket": int(p.get("ticket", 0)),
                "symbol": str(p.get("symbol", "")),
                "direction": direction,
                "volume": float(p.get("volume", 0.0)),
                "open_price": float(p.get("price_open", 0.0)),
                "current_price": float(p.get("price_current", 0.0)),
                "stop_loss": float(p.get("sl", 0.0)) if p.get("sl") else None,
                "take_profit": float(p.get("tp", 0.0)) if p.get("tp") else None,
                "current_profit": float(p.get("profit", 0.0)),
                "swap": float(p.get("swap", 0.0)),
                "commission": float(p.get("commission", 0.0)),
                "opened_at": open_time,
                "magic_number": int(p.get("magic", 0)),
                "comment": str(p.get("comment", "")),
            })

        return formatted

    def get_recent_deals(self, days: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Retrieves completed trade history deals for the past N days.
        Strictly read-only query using mt5.history_deals_get().
        """
        if not self._is_initialized:
            raise RuntimeError("MT5Connector is not initialized. Call initialize() first.")

        lookback_days = days if days is not None else self.history_days

        if self.simulation_mode:
            return []

        # Pass explicit Unix seconds to avoid datetime timezone interpretation
        # differences across Windows terminals and broker-server time zones.
        # The one-day padding at each edge keeps same-day deals in range even
        # when the broker's displayed clock differs from UTC.
        utc_now = datetime.now(tz=timezone.utc)
        date_from = int((utc_now - timedelta(days=lookback_days + 1)).timestamp())
        date_to = int((utc_now + timedelta(days=1)).timestamp())

        deals = mt5.history_deals_get(date_from, date_to)
        if deals is None:
            logger.warning(f"MT5 history query failed: {mt5.last_error()}")
            return []

        logger.info(
            f"MT5 returned {len(deals)} deal records for an approximately {lookback_days}-day history window"
        )

        formatted: List[Dict[str, Any]] = []
        for deal in deals:
            d = deal._asdict()

            # Entry Type mapping
            # 0: DEAL_ENTRY_IN, 1: DEAL_ENTRY_OUT, 2: DEAL_ENTRY_INOUT, 3: DEAL_ENTRY_OUT_BY
            raw_entry = d.get("entry", 0)
            entry_type = "IN" if raw_entry == 0 else "OUT" if raw_entry in (1, 3) else "INOUT"

            # Direction: 0 is BUY, 1 is SELL
            direction = "BUY" if d.get("type", 0) == 0 else "SELL"
            deal_time = datetime.fromtimestamp(d.get("time", 0), tz=timezone.utc).isoformat()

            formatted.append({
                "deal_ticket": int(d.get("ticket", 0)),
                "order_ticket": int(d.get("order", 0)) if d.get("order") else None,
                "position_id": int(d.get("position_id", 0)),
                "symbol": str(d.get("symbol", "")),
                "entry_type": entry_type,
                "direction": direction,
                "volume": float(d.get("volume", 0.0)),
                "price": float(d.get("price", 0.0)),
                "profit": float(d.get("profit", 0.0)),
                "commission": float(d.get("commission", 0.0)),
                "swap": float(d.get("swap", 0.0)),
                "fee": float(d.get("fee", 0.0)),
                "deal_time": deal_time,
                "magic_number": int(d.get("magic", 0)),
                "comment": str(d.get("comment", "")),
            })

        return formatted

    def fetch_full_snapshot(self, include_history: bool = True) -> Dict[str, Any]:
        """
        Packages account info, positions, and history into a clean payload.
        """
        return {
            "account": self.get_account_snapshot(),
            "positions": self.get_open_positions(),
            "deals": self.get_recent_deals() if include_history else [],
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }

    def shutdown(self) -> None:
        """
        Releases the IPC connection to MetaTrader 5.
        """
        if mt5 and self._is_initialized and not self.simulation_mode:
            mt5.shutdown()
        self._is_initialized = False

    # -------------------------------------------------------------------------
    # SAFETY ENFORCEMENT - PREVENT ACCIDENTAL TRADING IMPLEMENTATION
    # -------------------------------------------------------------------------
    def __getattr__(self, name: str):
        if "order" in name.lower() or "trade" in name.lower() or "close" in name.lower():
            raise AttributeError(
                f"Execution/trading method '{name}' is intentionally NOT implemented. "
                "This connector is strictly read-only for risk management and trade telemetry."
            )
        raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")
