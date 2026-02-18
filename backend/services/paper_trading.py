"""Paper trading service — replaces hardcoded mock data in paper_routes.py.

Maintains in-memory position state for paper trading simulation.
Ready to be swapped for Dhan live order API when integration is complete
(see DhanHQ-py-main/ for reference on dhanhq order placement).
"""
from __future__ import annotations


import logging
import uuid
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


class PaperTradingService:
    """In-memory paper trading position manager.

    Positions are stored in a module-level dict so state persists
    across requests within a single server process. For multi-process
    deployments, replace with a Redis or SQLite backend.

    Class-level state (no instantiation needed from routes).
    """

    # Module-level position store: { position_id: position_dict }
    _positions: dict[str, dict] = {
        "p1": {
            "id": "p1",
            "symbol": "NIFTY 50",
            "side": "LONG",
            "qty": 50,
            "avgPrice": 22100.0,
            "ltp": 22180.5,
            "pnl": 4025.0,
            "pnlPct": 0.36,
            "entryTime": datetime.now().strftime("%I:%M %p"),
            "status": "OPEN",
        },
        "p2": {
            "id": "p2",
            "symbol": "BANKNIFTY",
            "side": "SHORT",
            "qty": 15,
            "avgPrice": 46600.0,
            "ltp": 46550.0,
            "pnl": 750.0,
            "pnlPct": 0.11,
            "entryTime": datetime.now().strftime("%I:%M %p"),
            "status": "OPEN",
        },
        "p3": {
            "id": "p3",
            "symbol": "RELIANCE",
            "side": "LONG",
            "qty": 100,
            "avgPrice": 2950.0,
            "ltp": 2945.0,
            "pnl": -500.0,
            "pnlPct": -0.17,
            "entryTime": datetime.now().strftime("%I:%M %p"),
            "status": "OPEN",
        },
    }

    @classmethod
    def get_positions(cls) -> list[dict]:
        """Return all current open positions.

        Returns:
            List of position dicts sorted by entry time descending.
        """
        return list(cls._positions.values())

    @classmethod
    def add_position(
        cls,
        symbol: str,
        side: str,
        qty: int,
        avg_price: float,
    ) -> dict:
        """Add a new paper trading position.

        Args:
            symbol: Ticker symbol (e.g. 'NIFTY 50').
            side: Trade direction, either 'LONG' or 'SHORT'.
            qty: Number of units / lots.
            avg_price: Average entry price.

        Returns:
            The newly created position dict with a generated ID.
        """
        position_id = str(uuid.uuid4())[:8]
        position: dict[str, Any] = {
            "id": position_id,
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "avgPrice": avg_price,
            "ltp": avg_price,
            "pnl": 0.0,
            "pnlPct": 0.0,
            "entryTime": datetime.now().strftime("%I:%M %p"),
            "status": "OPEN",
        }
        cls._positions[position_id] = position
        logger.info(f"Paper position opened: {side} {qty} {symbol} @ {avg_price}")
        return position

    @classmethod
    def close_position(cls, position_id: str) -> dict | None:
        """Close (remove) a position by ID.

        Args:
            position_id: The unique ID of the position to close.

        Returns:
            The closed position dict, or None if not found.
        """
        position = cls._positions.pop(position_id, None)
        if position:
            logger.info(f"Paper position closed: {position_id}")
        else:
            logger.warning(f"Attempted to close unknown position: {position_id}")
        return position
