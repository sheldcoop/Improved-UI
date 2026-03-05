"""services/paper_scheduler.py — APScheduler integration for paper trading.

Manages one interval job per active monitor (signal check at candle close)
plus one fast recurring job to refresh LTP for all open positions.

Flask app must call `init_scheduler(app)` at startup.
"""
from __future__ import annotations

from logging import getLogger

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = getLogger(__name__)

# Interval in seconds per timeframe
_TIMEFRAME_SECONDS: dict[str, int] = {
    "1min":  60,
    "5min":  300,
    "15min": 900,
    "30min": 1800,
    "60min": 3600,
    "1hr":   3600,
    "daily": 86400,
}

_LTP_REFRESH_SECONDS = 30  # LTP update cadence independent of strategy timeframe

_scheduler: BackgroundScheduler | None = None


def _get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone=pytz.timezone("Asia/Kolkata"))
    return _scheduler


# ---------------------------------------------------------------------------
# Signal job
# ---------------------------------------------------------------------------

def _run_monitor_job(monitor_id: str) -> None:
    """Job callback: evaluate signal for one monitor and act on it.

    Args:
        monitor_id: The monitor's UUID to look up in the DB.
    """
    from services import paper_store
    from services.signal_checker import check_signal
    from services.ltp_service import get_ltp
    from datetime import datetime
    import uuid

    monitors = paper_store.get_monitors()
    monitor = next((m for m in monitors if m["id"] == monitor_id), None)
    if not monitor:
        logger.warning(f"Monitor {monitor_id} not found — removing job")
        stop_monitor(monitor_id)
        return

    symbol = monitor["symbol"]
    existing = paper_store.get_position_by_symbol(symbol)
    has_pos = existing is not None

    try:
        signal, qty, ltp, current_indicators = check_signal(
            monitor,
            virtual_capital=float(paper_store.get_setting("virtual_capital", "100000.0")),
            has_open_position=has_pos,
        )
    except Exception as exc:
        logger.error(f"Signal check failed for monitor {monitor_id}: {exc}", exc_info=True)
        return

    if signal == "BUY":
        # Compute SL/TP prices from percentage config
        sl_pct = monitor.get("sl_pct")
        tp_pct = monitor.get("tp_pct")
        tsl_pct = monitor.get("config", {}).get("tslPct")
        
        sl_price = round(ltp * (1 - sl_pct / 100), 2) if sl_pct else None
        tp_price = round(ltp * (1 + tp_pct / 100), 2) if tp_pct else None

        if tsl_pct:
            sl_price = round(ltp * (1 - tsl_pct / 100), 2)
            if current_indicators is None:
                current_indicators = {}
            current_indicators["tsl_pct"] = tsl_pct
            current_indicators["peak_price"] = ltp

        position = {
            "id":          str(uuid.uuid4())[:8],
            "monitor_id":  monitor_id,
            "symbol":      symbol,
            "side":        "LONG",
            "qty":         qty,
            "avg_price":   ltp,
            "ltp":         ltp,
            "pnl":         0.0,
            "pnl_pct":     0.0,
            "sl_price":    sl_price,
            "tp_price":    tp_price,
            "entry_time":  datetime.now().isoformat(),
            "indicators":  current_indicators,
        }
        paper_store.save_position(position)
        logger.info(f"Paper BUY: {symbol} {qty} units @ ₹{ltp:.2f}")

    elif signal == "SELL" and existing:
        paper_store.close_position(existing["id"], ltp, exit_reason="SIGNAL")
        logger.info(f"Paper SELL: {symbol} closed @ ₹{ltp:.2f}")


# ---------------------------------------------------------------------------
# LTP refresh job
# ---------------------------------------------------------------------------

def _run_ltp_refresh() -> None:
    """Global LTP refresh job — runs every 30 seconds."""
    try:
        from services.ltp_service import refresh_all_positions
        refresh_all_positions()
    except Exception as exc:
        logger.error(f"LTP refresh failed: {exc}", exc_info=True)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_monitor(monitor: dict) -> None:
    """Add an interval job for a new monitor.

    Args:
        monitor: Monitor dict with keys: id, timeframe.
    """
    scheduler = _get_scheduler()
    monitor_id = monitor["id"]
    interval_sec = _TIMEFRAME_SECONDS.get(monitor.get("timeframe", "15min"), 900)
    _tz = pytz.timezone("Asia/Kolkata")

    job_id = f"monitor_{monitor_id}"
    if scheduler.get_job(job_id):
        logger.debug(f"Monitor job already exists: {job_id}")
        return

    scheduler.add_job(
        _run_monitor_job,
        trigger=IntervalTrigger(seconds=interval_sec, timezone=_tz),
        id=job_id,
        args=[monitor_id],
        replace_existing=True,
    )
    logger.info(f"Started monitor job: {job_id} every {interval_sec}s")


def stop_monitor(monitor_id: str) -> None:
    """Remove the interval job for a monitor.

    Args:
        monitor_id: Monitor UUID to stop.
    """
    scheduler = _get_scheduler()
    job_id = f"monitor_{monitor_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Stopped monitor job: {job_id}")


def restore_on_startup() -> None:
    """Reload all active monitors from SQLite and restart their jobs.

    Called once during Flask app startup. Ensures paper trading survives
    server restarts without losing active monitors.
    """
    from services import paper_store
    monitors = paper_store.get_monitors()
    for monitor in monitors:
        if monitor.get("status") == "WATCHING":
            start_monitor(monitor)
    logger.info(f"Restored {len(monitors)} monitor(s) from DB")


def init_scheduler(app) -> None:
    """Start the scheduler and register jobs. Call once at Flask startup.

    Args:
        app: Flask application instance (used for app context in jobs).
    """
    scheduler = _get_scheduler()

    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")

    # Global LTP refresh — always running.
    # coalesce=True: if a tick is missed, skip it (don't pile up).
    # max_instances=1: never run two LTP refreshes concurrently.
    _tz = pytz.timezone("Asia/Kolkata")
    if not scheduler.get_job("ltp_refresh"):
        scheduler.add_job(
            _run_ltp_refresh,
            trigger=IntervalTrigger(seconds=_LTP_REFRESH_SECONDS, timezone=_tz),
            id="ltp_refresh",
            coalesce=True,
            max_instances=1,
        )

    # Restore monitors from DB
    restore_on_startup()
