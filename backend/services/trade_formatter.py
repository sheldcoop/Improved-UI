"""trade_formatter.py — Format VectorBT trade records into API-ready dicts.

Extracted from backtest_engine.py so the same format can be reused by
paper_trading_engine.py and any future live execution services without
importing from backtest_engine.

Usage:
    from services.trade_formatter import format_trade_records

    trades = format_trade_records(pf)
"""
from __future__ import annotations

import logging
from typing import Any

import vectorbt as vbt

logger = logging.getLogger(__name__)


def format_trade_records(pf: vbt.Portfolio) -> list[dict[str, Any]]:
    """Extract completed trades from a VectorBT Portfolio into API-ready dicts.

    Uses .to_dict(orient="records") instead of iterrows() — roughly 10-50x
    faster for large trade logs (500+ trades).

    Args:
        pf: Completed VectorBT Portfolio instance.

    Returns:
        List of trade dicts, chronological order (oldest first), with keys:
        - id (str): Unique trade identifier, e.g. "t-0"
        - entryDate (str): Entry timestamp as string
        - exitDate (str): Exit timestamp as string
        - side (str): "LONG" or "SHORT"
        - qty (float | None): Position size, rounded to 4 decimal places
        - entryPrice (float): Average entry price
        - exitPrice (float): Average exit price
        - pnl (float): Absolute profit/loss in currency
        - pnlPct (float): Return percentage (e.g. 4.25 means +4.25%)
        - status (str): "WIN" if pnl > 0 else "LOSS"

    Example:
        >>> pf = vbt.Portfolio.from_signals(close, entries, exits)
        >>> trades = format_trade_records(pf)
        >>> return jsonify({"trades": trades})
    """
    if not hasattr(pf.trades, "records_readable"):
        return []

    rec = pf.trades.records_readable
    if rec.empty:
        return []

    trades: list[dict[str, Any]] = []
    rows = rec.to_dict(orient="records")   # vectorized — no iterrows()

    for i, row in enumerate(rows):
        pnl = float(row.get("PnL", 0))
        trades.append({
            "id":         f"t-{i}",
            "entryDate":  str(row.get("Entry Timestamp", "")),
            "exitDate":   str(row.get("Exit Timestamp", "")),
            "side":       "LONG" if row.get("Direction") == "Long" else "SHORT",
            "qty":        round(float(row["Size"]), 4) if "Size" in row else None,
            "entryPrice": round(float(row.get("Avg Entry Price", 0)), 2),
            "exitPrice":  round(float(row.get("Avg Exit Price", 0)), 2),
            "pnl":        round(pnl, 2),
            "pnlPct":     round(float(row.get("Return", 0)) * 100, 2),
            "status":     "WIN" if pnl > 0 else "LOSS",
        })

    return trades
