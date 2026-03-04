"""Paper trading blueprint — HTTP handlers only, no business logic.

All state lives in services/paper_store.py.
All scheduling lives in services/paper_scheduler.py.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, Response
from logging import getLogger
import json

from services import paper_store
from services.paper_scheduler import start_monitor, stop_monitor

paper_bp = Blueprint("paper_trading", __name__)
logger = getLogger(__name__)

_MAX_MONITORS = 3


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@paper_bp.route("/settings", methods=["GET"])
def get_settings():
    """Return global paper trading settings.

    Returns:
        JSON with capitalPct (float), virtualCapital (float).
    """
    try:
        return jsonify({
            "capitalPct":     float(paper_store.get_setting("capital_pct", "10.0")),
            "virtualCapital": float(paper_store.get_setting("virtual_capital", "100000.0")),
        }), 200
    except Exception as exc:
        logger.error(f"get_settings failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to load settings"}), 500


@paper_bp.route("/settings", methods=["POST"])
def update_settings():
    """Update global paper trading settings.

    Request JSON:
        capitalPct (float): % of capital per trade. Must be 1–100.
        virtualCapital (float): Virtual capital in ₹. Must be > 0. (optional)

    Returns:
        Updated settings JSON (200) or 400 on invalid input.
    """
    try:
        data = request.json or {}
        capital_pct = data.get("capitalPct")
        virtual_capital = data.get("virtualCapital")

        if capital_pct is None and virtual_capital is None:
            return jsonify({"status": "error", "message": "capitalPct or virtualCapital is required"}), 400

        if capital_pct is not None:
            if not isinstance(capital_pct, (int, float)) or not (1 <= capital_pct <= 100):
                return jsonify({"status": "error", "message": "capitalPct must be between 1 and 100"}), 400
            paper_store.set_setting("capital_pct", str(float(capital_pct)))

        if virtual_capital is not None:
            if not isinstance(virtual_capital, (int, float)) or virtual_capital <= 0:
                return jsonify({"status": "error", "message": "virtualCapital must be a positive number"}), 400
            paper_store.set_setting("virtual_capital", str(float(virtual_capital)))

        return jsonify({
            "capitalPct":     float(paper_store.get_setting("capital_pct", "10.0")),
            "virtualCapital": float(paper_store.get_setting("virtual_capital", "100000.0")),
        }), 200
    except Exception as exc:
        logger.error(f"update_settings failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to update settings"}), 500


# ---------------------------------------------------------------------------
# Monitors
# ---------------------------------------------------------------------------

@paper_bp.route("/monitors", methods=["GET"])
def get_monitors():
    """Return all active strategy monitors.

    Returns:
        JSON array of monitor dicts.
    """
    try:
        return jsonify(paper_store.get_monitors()), 200
    except Exception as exc:
        logger.error(f"get_monitors failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch monitors"}), 500


@paper_bp.route("/monitors", methods=["POST"])
def create_monitor():
    """Create and start a new strategy monitor.

    Request JSON:
        symbol (str): NSE ticker (required).
        strategyId (str): Preset or saved strategy ID (required).
        config (dict): Strategy parameters (required).
        timeframe (str): Candle interval, e.g. '15min' (required).
        slPct (float): Stop-loss % (optional).
        tpPct (float): Take-profit % (optional).

    Returns:
        201 with monitor dict, 400 on invalid input, 409 if max monitors reached.
    """
    try:
        data = request.json or {}

        # Validate required fields
        symbol      = data.get("symbol", "").strip().upper()
        strategy_id = data.get("strategyId", "").strip()
        config      = data.get("config", {})
        timeframe   = data.get("timeframe", "15min").strip()

        if not symbol:
            return jsonify({"status": "error", "message": "symbol is required"}), 400
        if not strategy_id:
            return jsonify({"status": "error", "message": "strategyId is required"}), 400
        if not isinstance(config, dict):
            return jsonify({"status": "error", "message": "config must be an object"}), 400

        # Cap at max monitors
        existing = paper_store.get_monitors()
        if len(existing) >= _MAX_MONITORS:
            return jsonify({
                "status": "error",
                "message": f"Maximum {_MAX_MONITORS} monitors allowed"
            }), 409

        capital_pct = float(paper_store.get_setting("capital_pct", "10.0"))

        monitor: dict = {
            "id":           str(uuid.uuid4()),
            "symbol":       symbol,
            "strategy_id":  strategy_id,
            "config":       config,
            "timeframe":    timeframe,
            "capital_pct":  capital_pct,
            "sl_pct":       data.get("slPct"),
            "tp_pct":       data.get("tpPct"),
            "status":       "WATCHING",
            "created_at":   datetime.now().isoformat(),
        }

        paper_store.save_monitor(monitor)
        start_monitor(monitor)

        logger.info(f"Monitor created: {symbol} / {strategy_id} / {timeframe}")
        return jsonify(monitor), 201

    except Exception as exc:
        logger.error(f"create_monitor failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to create monitor"}), 500


@paper_bp.route("/monitors/<monitor_id>", methods=["DELETE"])
def delete_monitor(monitor_id: str):
    """Stop and delete a strategy monitor.

    Args:
        monitor_id: Monitor UUID from URL path.

    Returns:
        200 with deleted monitor, 404 if not found.
    """
    try:
        stop_monitor(monitor_id)
        deleted = paper_store.delete_monitor(monitor_id)
        if not deleted:
            return jsonify({"status": "error", "message": "Monitor not found"}), 404
        return jsonify({"status": "success", "id": monitor_id}), 200
    except Exception as exc:
        logger.error(f"delete_monitor failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to delete monitor"}), 500


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

@paper_bp.route("/positions", methods=["GET"])
def get_positions():
    """Return all open paper trading positions.

    Returns:
        JSON array of position dicts.
    """
    try:
        return jsonify(paper_store.get_positions()), 200
    except Exception as exc:
        logger.error(f"get_positions failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch positions"}), 500


@paper_bp.route("/positions", methods=["POST"])
def add_position():
    """Manually open a paper trading position.

    Request JSON:
        symbol (str): Required.
        side (str): 'LONG' or 'SHORT'. Required.
        qty (int): Positive integer. Required.
        avgPrice (float): Entry price. Required.

    Returns:
        201 with position dict.
    """
    try:
        data = request.json or {}
        symbol    = data.get("symbol", "").strip().upper()
        side      = data.get("side", "").upper()
        qty       = data.get("qty")
        avg_price = data.get("avgPrice")

        if not symbol:
            return jsonify({"status": "error", "message": "symbol is required"}), 400
        if side not in ("LONG", "SHORT"):
            return jsonify({"status": "error", "message": "side must be LONG or SHORT"}), 400
        if not qty or not isinstance(qty, (int, float)) or qty <= 0:
            return jsonify({"status": "error", "message": "qty must be a positive number"}), 400
        if not avg_price or not isinstance(avg_price, (int, float)) or avg_price <= 0:
            return jsonify({"status": "error", "message": "avgPrice must be positive"}), 400

        import uuid as _uuid
        position = {
            "id":         str(_uuid.uuid4())[:8],
            "monitor_id": None,
            "symbol":     symbol,
            "side":       side,
            "qty":        int(qty),
            "avg_price":  float(avg_price),
            "ltp":        float(avg_price),
            "pnl":        0.0,
            "pnl_pct":    0.0,
            "sl_price":   None,
            "tp_price":   None,
            "entry_time": datetime.now().isoformat(),
        }
        paper_store.save_position(position)
        return jsonify(position), 201

    except Exception as exc:
        logger.error(f"add_position failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to add position"}), 500


@paper_bp.route("/positions/<position_id>", methods=["DELETE"])
def close_position(position_id: str):
    """Manually close an open position.

    Args:
        position_id: Position ID from URL path.

    Returns:
        200 with closed position dict, 404 if not found.
    """
    try:
        from services.ltp_service import get_ltp

        # Try to get current LTP for realistic close price
        positions = paper_store.get_positions()
        pos = next((p for p in positions if p["id"] == position_id), None)
        if not pos:
            return jsonify({"status": "error", "message": "Position not found"}), 404

        exit_price = get_ltp(pos["symbol"]) or pos["ltp"]
        closed = paper_store.close_position(position_id, exit_price, exit_reason="MANUAL")
        if not closed:
            return jsonify({"status": "error", "message": "Position not found"}), 404
        return jsonify(closed), 200

    except Exception as exc:
        logger.error(f"close_position failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to close position"}), 500


# ---------------------------------------------------------------------------
# Trade History
# ---------------------------------------------------------------------------

@paper_bp.route("/history", methods=["GET"])
def get_trade_history():
    """Return all closed trades ordered by exit time descending.

    Returns:
        JSON array of trade history dicts.
    """
    try:
        return jsonify(paper_store.get_trade_history()), 200
    except Exception as exc:
        logger.error(f"get_trade_history failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch trade history"}), 500

# ---------------------------------------------------------------------------
# Replay Mode
# ---------------------------------------------------------------------------

@paper_bp.route("/replay", methods=["POST"])
def run_replay():
    """Run historical replay for a single configuration.
    
    Request JSON:
        symbol (str): NSE ticker
        strategyId (str): Preset or saved strategy ID
        timeframe (str): Candle interval
        fromDate (str): YYYY-MM-DD
        toDate (str): YYYY-MM-DD
        slPct (float): Stop-loss % (optional)
        tpPct (float): Take-profit % (optional)
        
    Returns:
        JSON with 'events' array representing bar-by-bar updates.
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol")
        strategy_id = data.get("strategyId")
        timeframe = data.get("timeframe", "15min")
        from_date = data.get("fromDate")
        to_date = data.get("toDate")
        sl_pct = data.get("slPct")
        tp_pct = data.get("tpPct")
        capital_pct = float(paper_store.get_setting("capital_pct", "10.0"))
        virtual_capital = float(paper_store.get_setting("virtual_capital", "100000.0"))

        if not all([symbol, strategy_id, from_date, to_date]):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400

        from services.dhan_historical import DhanHistoricalService
        from services.scrip_master import get_instrument_by_symbol
        scrip = get_instrument_by_symbol(symbol)
        if not scrip:
            return jsonify({"status": "error", "message": f"Could not find scrip for symbol {symbol}"}), 404

        fetcher = DhanHistoricalService()
        df = fetcher.fetch_ohlcv(
            security_id=scrip['security_id'],
            exchange_segment=scrip['exchange_segment'],
            instrument_type=scrip['instrument_type'],
            timeframe=timeframe,
            from_date=from_date,
            to_date=to_date
        )

        if df is None or df.empty:
            return jsonify({"status": "error", "message": "No historical data found for range"}), 404

        # Load custom strategy config from store (same pattern as backtest engine)
        from strategies.presets import StrategyFactory
        from services.strategy_store import StrategyStore
        config = {}
        if strategy_id not in ("1", "2", "3", "4", "5", "6", "7"):
            saved = StrategyStore.get_by_id(strategy_id)
            if saved:
                config = saved
                logger.info(f"Replay loaded custom strategy: {saved.get('name')}")

        # Pre-compute all signals once on the full DataFrame (O(n) not O(n²))
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits, _ = strategy.generate_signals(df)

        import uuid as _uuid
        events = []
        open_pos = None

        for bar_idx in range(len(df)):
            row = df.iloc[bar_idx]
            ltp = float(row['close'])
            timestamp = str(row['timestamp']) if 'timestamp' in row else str(df.index[bar_idx])

            # Check SL / TP first
            sl_hit = tp_hit = False
            if open_pos:
                if sl_pct and ltp <= open_pos["avg_price"] * (1 - sl_pct / 100.0):
                    sl_hit = True
                elif tp_pct and ltp >= open_pos["avg_price"] * (1 + tp_pct / 100.0):
                    tp_hit = True

                if sl_hit or tp_hit:
                    reason = "SL" if sl_hit else "TP"
                    pnl = (ltp - open_pos["avg_price"]) * open_pos["qty"]
                    pnl_pct = (ltp / open_pos["avg_price"] - 1) * 100
                    events.append({
                        "type": "TRADE_CLOSED",
                        "timestamp": timestamp,
                        "ltp": ltp,
                        "trade": {
                            **open_pos,
                            "exit_price": ltp,
                            "exit_time": timestamp,
                            "exit_reason": reason,
                            "pnl": pnl,
                            "pnl_pct": pnl_pct
                        }
                    })
                    open_pos = None
                    continue  # Wait until next bar to evaluate signals

            # Read pre-computed signal for this bar
            entry_sig = bool(entries.iloc[bar_idx]) if bar_idx < len(entries) else False
            exit_sig  = bool(exits.iloc[bar_idx])  if bar_idx < len(exits)   else False

            if entry_sig and not open_pos:
                qty = max(1, int((virtual_capital * (capital_pct / 100.0)) / ltp)) if ltp > 0 else 1
                open_pos = {
                    "id": str(_uuid.uuid4())[:8],
                    "symbol": symbol,
                    "side": "LONG",
                    "qty": qty,
                    "avg_price": ltp,
                    "entry_time": timestamp,
                }
                events.append({
                    "type": "POSITION_OPENED",
                    "timestamp": timestamp,
                    "ltp": ltp,
                    "position": dict(open_pos)
                })
            elif exit_sig and open_pos:
                pnl = (ltp - open_pos["avg_price"]) * open_pos["qty"]
                pnl_pct = (ltp / open_pos["avg_price"] - 1) * 100
                events.append({
                    "type": "TRADE_CLOSED",
                    "timestamp": timestamp,
                    "ltp": ltp,
                    "trade": {
                        **open_pos,
                        "exit_price": ltp,
                        "exit_time": timestamp,
                        "exit_reason": "SIGNAL",
                        "pnl": pnl,
                        "pnl_pct": pnl_pct
                    }
                })
                open_pos = None
            else:
                events.append({
                    "type": "TICK",
                    "timestamp": timestamp,
                    "ltp": ltp
                })

        return jsonify({"events": events}), 200

    except Exception as exc:
        logger.error(f"run_replay failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": f"Replay failed: {exc}"}), 500
