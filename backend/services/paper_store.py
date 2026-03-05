"""services/paper_store.py — SQLite persistence for paper trading.

Three tables:
  monitors      — active strategy watches (symbol, strategy config, timeframe)
  positions     — open paper positions with live LTP/PnL
  trade_history — record of every closed trade
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any
from logging import getLogger

logger = getLogger(__name__)

# Database file lives alongside other data files
_DB_PATH = Path(__file__).parent.parent / "data" / "paper_trading.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    conn.execute("PRAGMA journal_mode=WAL")  # safe for concurrent reads
    return conn


@contextmanager
def _db():
    """Context manager — opens connection, commits on success, rolls back on error."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if they do not exist.

    Called once at Flask startup. Safe to call multiple times (idempotent).
    """
    with _db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS monitors (
                id          TEXT PRIMARY KEY,
                symbol      TEXT NOT NULL,
                strategy_id TEXT NOT NULL,
                config      TEXT NOT NULL,   -- JSON
                timeframe   TEXT NOT NULL,
                capital_pct REAL NOT NULL DEFAULT 10.0,
                sl_pct      REAL,
                tp_pct      REAL,
                status      TEXT NOT NULL DEFAULT 'WATCHING',
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS positions (
                id          TEXT PRIMARY KEY,
                monitor_id  TEXT,
                symbol      TEXT NOT NULL,
                side        TEXT NOT NULL,
                qty         INTEGER NOT NULL,
                avg_price   REAL NOT NULL,
                ltp         REAL NOT NULL,
                pnl         REAL NOT NULL DEFAULT 0.0,
                pnl_pct     REAL NOT NULL DEFAULT 0.0,
                sl_price    REAL,
                tp_price    REAL,
                entry_time  TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'OPEN',
                indicators  TEXT
            );

            CREATE TABLE IF NOT EXISTS trade_history (
                id          TEXT PRIMARY KEY,
                monitor_id  TEXT,
                symbol      TEXT NOT NULL,
                side        TEXT NOT NULL,
                qty         INTEGER NOT NULL,
                entry_price REAL NOT NULL,
                exit_price  REAL NOT NULL,
                pnl         REAL NOT NULL,
                pnl_pct     REAL NOT NULL,
                entry_time  TEXT NOT NULL,
                exit_time   TEXT NOT NULL,
                strategy_id TEXT,
                exit_reason TEXT DEFAULT 'SIGNAL',
                indicators  TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS saved_runs (
                id            TEXT PRIMARY KEY,
                run_type      TEXT NOT NULL, -- 'BACKTEST' or 'REPLAY'
                symbol        TEXT NOT NULL,
                strategy_id   TEXT NOT NULL,
                summary_json  TEXT NOT NULL, -- JSON
                results_json  TEXT NOT NULL, -- JSON
                created_at    TEXT NOT NULL
            );
        """)
        
        # Schema upgrade for Phase 1: Trade Audit Trails
        try:
            conn.execute("ALTER TABLE positions ADD COLUMN indicators TEXT")
            conn.execute("ALTER TABLE trade_history ADD COLUMN indicators TEXT")
            logger.info("Migrated SQLite schema to include 'indicators' columns.")
        except sqlite3.OperationalError:
            pass  # Columns already exist

    logger.info(f"Paper trading DB initialised at {_DB_PATH}")


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def get_setting(key: str, default: str = "") -> str:
    """Retrieve a settings value by key.

    Args:
        key: Setting name.
        default: Value to return if not found.

    Returns:
        Setting value as string.
    """
    with _db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    """Upsert a settings value.

    Args:
        key: Setting name.
        value: Value to store.
    """
    with _db() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


# ---------------------------------------------------------------------------
# Monitors
# ---------------------------------------------------------------------------

def save_monitor(monitor: dict) -> dict:
    """Insert or replace a monitor record.

    Args:
        monitor: Dict with keys: id, symbol, strategy_id, config (dict),
            timeframe, capital_pct, sl_pct, tp_pct, status, created_at.

    Returns:
        The monitor dict as stored.
    """
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO monitors (id, symbol, strategy_id, config, timeframe,
                capital_pct, sl_pct, tp_pct, status, created_at)
            VALUES (:id, :symbol, :strategy_id, :config, :timeframe,
                :capital_pct, :sl_pct, :tp_pct, :status, :created_at)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status
            """,
            {**monitor, "config": json.dumps(monitor.get("config", {}))},
        )
    return monitor


def get_monitors() -> list[dict]:
    """Return all monitors ordered by creation time.

    Returns:
        List of monitor dicts with config parsed back to dict.
    """
    with _db() as conn:
        rows = conn.execute("SELECT * FROM monitors ORDER BY created_at").fetchall()
        result = []
        for row in rows:
            m = dict(row)
            m["config"] = json.loads(m["config"])
            result.append(m)
        return result


def delete_monitor(monitor_id: str) -> bool:
    """Delete a monitor by ID.

    Args:
        monitor_id: The monitor's UUID string.

    Returns:
        True if deleted, False if not found.
    """
    with _db() as conn:
        cursor = conn.execute("DELETE FROM monitors WHERE id=?", (monitor_id,))
        return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

def save_position(position: dict) -> dict:
    """Insert a new open position.

    Args:
        position: Dict with keys: id, monitor_id, symbol, side, qty,
            avg_price, ltp, pnl, pnl_pct, sl_price, tp_price, entry_time.

    Returns:
        The position dict as stored.
    """
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO positions (id, monitor_id, symbol, side, qty, avg_price,
                ltp, pnl, pnl_pct, sl_price, tp_price, entry_time, status, indicators)
            VALUES (:id, :monitor_id, :symbol, :side, :qty, :avg_price,
                :ltp, :pnl, :pnl_pct, :sl_price, :tp_price, :entry_time, 'OPEN', :indicators)
            """,
            {**position, "indicators": json.dumps(position.get("indicators", {}))},
        )
    return position


def get_positions() -> list[dict]:
    """Return all open positions.

    Returns:
        List of position dicts.
    """
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM positions WHERE status='OPEN' ORDER BY entry_time DESC"
        ).fetchall()
        
        result = []
        for row in rows:
            pos = dict(row)
            if pos.get("indicators"):
                try:
                    pos["indicators"] = json.loads(pos["indicators"])
                except Exception:
                    pos["indicators"] = {}
            else:
                pos["indicators"] = {}
            result.append(pos)
        return result


def get_position_by_symbol(symbol: str) -> dict | None:
    """Return the first open position for a symbol, or None.

    Args:
        symbol: Stock ticker/index name.

    Returns:
        Position dict or None.
    """
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM positions WHERE symbol=? AND status='OPEN' LIMIT 1",
            (symbol,),
        ).fetchone()
        return dict(row) if row else None


def update_position_ltp(position_id: str, ltp: float, pnl: float, pnl_pct: float, indicators: dict | None = None) -> None:
    """Update the live price and P&L of an open position.

    Args:
        position_id: Position UUID.
        ltp: Current last traded price.
        pnl: Absolute P&L in ₹.
        pnl_pct: P&L as percentage.
        indicators: Optional updated indicators dictionary.
    """
    with _db() as conn:
        if indicators is not None:
            conn.execute(
                "UPDATE positions SET ltp=?, pnl=?, pnl_pct=?, indicators=? WHERE id=?",
                (ltp, pnl, pnl_pct, json.dumps(indicators), position_id),
            )
        else:
            conn.execute(
                "UPDATE positions SET ltp=?, pnl=?, pnl_pct=? WHERE id=?",
                (ltp, pnl, pnl_pct, position_id),
            )


def close_position(
    position_id: str,
    exit_price: float,
    exit_reason: str = "SIGNAL",
    commission: float = 0.0,
) -> dict | None:
    """Close an open position and record it in trade_history.

    Args:
        position_id: Position UUID to close.
        exit_price: Price at which the position is closed (already slippage-adjusted).
        exit_reason: 'SIGNAL', 'SL', 'TP', or 'MANUAL'.
        commission: Fixed commission (₹) to deduct from P&L for this exit leg.
            The entry leg commission should already be reflected in avg_price.

    Returns:
        The closed position dict, or None if not found.
    """
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM positions WHERE id=? AND status='OPEN'", (position_id,)
        ).fetchone()
        if not row:
            return None

        pos = dict(row)
        exit_time = datetime.now().isoformat()

        # Calculate final P&L, deducting exit-leg commission
        multiplier = 1 if pos["side"] == "LONG" else -1
        pnl = multiplier * (exit_price - pos["avg_price"]) * pos["qty"] - commission
        pnl_pct = (pnl / (pos["avg_price"] * pos["qty"])) * 100

        conn.execute("UPDATE positions SET status='CLOSED' WHERE id=?", (position_id,))

        # Look up monitor's strategy_id so trade history is filterable
        strategy_id: str | None = None
        if pos.get("monitor_id"):
            mon_row = conn.execute(
                "SELECT strategy_id FROM monitors WHERE id=?", (pos["monitor_id"],)
            ).fetchone()
            if mon_row:
                strategy_id = mon_row["strategy_id"]

        conn.execute(
            """
            INSERT INTO trade_history
                (id, monitor_id, symbol, side, qty, entry_price, exit_price,
                 pnl, pnl_pct, entry_time, exit_time, strategy_id, exit_reason, indicators)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"h_{position_id}", pos["monitor_id"], pos["symbol"], pos["side"],
                pos["qty"], pos["avg_price"], exit_price,
                round(pnl, 2), round(pnl_pct, 4),
                pos["entry_time"], exit_time, strategy_id, exit_reason,
                pos.get("indicators", "{}"),
            ),
        )
        logger.info(f"Position closed: {position_id} {exit_reason} P&L=₹{pnl:.2f}")
        pos["exit_price"] = exit_price
        pos["pnl"] = round(pnl, 2)
        pos["exit_reason"] = exit_reason
        return pos


# ---------------------------------------------------------------------------
# Trade History
# ---------------------------------------------------------------------------

def get_trade_history() -> list[dict]:
    """Return all closed trades ordered by exit time descending.

    Returns:
        List of trade history dicts.
    """
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM trade_history ORDER BY exit_time DESC"
        ).fetchall()
        
        result = []
        for row in rows:
            trade = dict(row)
            if trade.get("indicators"):
                try:
                    trade["indicators"] = json.loads(trade["indicators"])
                except Exception:
                    trade["indicators"] = {}
            else:
                trade["indicators"] = {}
            result.append(trade)
        return result


# ---------------------------------------------------------------------------
# Saved Runs (Backtest & Replay Vault)
# ---------------------------------------------------------------------------

def save_run(
    run_id: str,
    run_type: str,
    symbol: str,
    strategy_id: str,
    summary: dict,
    results: dict | list,
) -> None:
    """Save a backtest or replay simulation run for later viewing.

    Args:
        run_id: Unique UUID string for this simulation.
        run_type: 'BACKTEST' or 'REPLAY'.
        symbol: Instrument symbol run on.
        strategy_id: Used strategy ID.
        summary: Summary dict to display in the grid view.
        results: Massive payload of events, equity curves or trade arrays.
    """
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO saved_runs 
                (id, run_type, symbol, strategy_id, summary_json, results_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                run_type,
                symbol,
                strategy_id,
                json.dumps(summary),
                json.dumps(results),
                datetime.now().isoformat()
            )
        )
    logger.info(f"Saved {run_type} run '{run_id}' into vault.")


def get_runs_list(run_type: str = None) -> list[dict]:
    """Get metadata for all saved runs, without loading the massive results array.
    
    Returns:
        List of summary dicts.
    """
    query = "SELECT id, run_type, symbol, strategy_id, summary_json, created_at FROM saved_runs"
    params = []
    if run_type:
        query += " WHERE run_type = ?"
        params.append(run_type)
    query += " ORDER BY created_at DESC"

    with _db() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
        
        vault = []
        for row in rows:
            record = dict(row)
            try:
                record["summary"] = json.loads(record.pop("summary_json"))
            except Exception:
                record["summary"] = {}
            vault.append(record)
        return vault


def get_run(run_id: str) -> dict | None:
    """Load a specific saved run entirely from the vault.
    
    Returns:
        Dict containing summary and full results, or None.
    """
    with _db() as conn:
        row = conn.execute("SELECT * FROM saved_runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            return None
            
        record = dict(row)
        try:
            record["summary"] = json.loads(record["summary_json"])
            record["results"] = json.loads(record["results_json"])
        except Exception:
            return None
        
        del record["summary_json"]
        del record["results_json"]
        return record


def delete_run(run_id: str) -> bool:
    """Delete a saved run from the vault."""
    with _db() as conn:
        cursor = conn.execute("DELETE FROM saved_runs WHERE id=?", (run_id,))
        return cursor.rowcount > 0
