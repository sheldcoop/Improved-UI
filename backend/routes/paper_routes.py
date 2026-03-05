"""Paper trading blueprint — HTTP handlers only, no business logic.

All state lives in services/paper_store.py.
All scheduling lives in services/paper_scheduler.py.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
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
            "slippage":       float(paper_store.get_setting("slippage", "0.05")),
            "commission":     float(paper_store.get_setting("commission", "20.0")),
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
        slippage (float): Execute penalty % per trade. (optional)
        commission (float): INR flat fee per trade. (optional)

    Returns:
        Updated settings JSON (200) or 400 on invalid input.
    """
    try:
        data = request.json or {}
        capital_pct = data.get("capitalPct")
        virtual_capital = data.get("virtualCapital")
        slippage = data.get("slippage")
        commission = data.get("commission")

        if capital_pct is None and virtual_capital is None and slippage is None and commission is None:
            return jsonify({"status": "error", "message": "At least one setting parameter is required"}), 400

        if capital_pct is not None:
            if not isinstance(capital_pct, (int, float)) or not (1 <= capital_pct <= 100):
                return jsonify({"status": "error", "message": "capitalPct must be between 1 and 100"}), 400
            paper_store.set_setting("capital_pct", str(float(capital_pct)))

        if virtual_capital is not None:
            if not isinstance(virtual_capital, (int, float)) or virtual_capital <= 0:
                return jsonify({"status": "error", "message": "virtualCapital must be a positive number"}), 400
            paper_store.set_setting("virtual_capital", str(float(virtual_capital)))

        if slippage is not None:
            if not isinstance(slippage, (int, float)) or slippage < 0:
                return jsonify({"status": "error", "message": "slippage must be >= 0"}), 400
            paper_store.set_setting("slippage", str(float(slippage)))

        if commission is not None:
            if not isinstance(commission, (int, float)) or commission < 0:
                return jsonify({"status": "error", "message": "commission must be >= 0"}), 400
            paper_store.set_setting("commission", str(float(commission)))

        return jsonify({
            "capitalPct":     float(paper_store.get_setting("capital_pct", "10.0")),
            "virtualCapital": float(paper_store.get_setting("virtual_capital", "100000.0")),
            "slippage":       float(paper_store.get_setting("slippage", "0.05")),
            "commission":     float(paper_store.get_setting("commission", "20.0")),
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
        tslPct (float): Trailing Stop-loss % (optional).

    Returns:
        201 with monitor dict, 400 on invalid input, 409 if max monitors reached.
    """
    try:
        data = request.json or {}

        # Validate required fields
        symbol      = data.get("symbol", "").strip().upper()
        strategy_id = data.get("strategyId", "").strip()
        config      = data.get("config", {})
        
        # Inject tslPct securely into config JSON to avoid SQLite schema alters
        if data.get("tslPct") is not None:
            config["tslPct"] = float(data.get("tslPct"))

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

    Performs a force-close on any open position tied to this monitor
    before deleting it, so no position is ever left orphaned without
    an active LTP/signal checker.

    Args:
        monitor_id: Monitor UUID from URL path.

    Returns:
        200 with deleted id, 404 if monitor not found.
    """
    try:
        # ------------------------------------------------------------------
        # Force-close any open positions tied to this monitor
        # ------------------------------------------------------------------
        all_positions = paper_store.get_positions()
        orphaned = [p for p in all_positions if p.get("monitor_id") == monitor_id]

        if orphaned:
            from services.ltp_service import get_ltp
            for pos in orphaned:
                ltp = get_ltp(pos["symbol"])
                # Fall back to avg_price if live LTP unavailable (weekend / API error)
                exit_price = ltp if ltp is not None else float(pos["avg_price"])
                paper_store.close_position(pos["id"], exit_price, exit_reason="MONITOR_DELETED")
                logger.info(
                    f"Force-closed position {pos['id']} ({pos['symbol']}) "
                    f"@ ₹{exit_price:.2f} — monitor {monitor_id} deleted"
                )

        # ------------------------------------------------------------------
        # Stop scheduler job and delete monitor from DB
        # ------------------------------------------------------------------
        stop_monitor(monitor_id)
        deleted = paper_store.delete_monitor(monitor_id)
        if not deleted:
            return jsonify({"status": "error", "message": "Monitor not found"}), 404

        return jsonify({"status": "success", "id": monitor_id,
                        "forceClosed": len(orphaned)}), 200

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

    Delegates all simulation logic to ``ReplayEngine.run()`` which handles
    data fetching (cache-first), signal computation, LONG/SHORT position
    management, SL/TP triggers, and equity tracking.

    Request JSON:
        symbol (str): NSE ticker
        strategyId (str): Preset ('1'-'7') or saved-strategy UUID
        timeframe (str): Candle interval (e.g. '15m', '1d')
        fromDate (str): YYYY-MM-DD
        toDate (str): YYYY-MM-DD
        slPct (float): Stop-loss %, optional
        tpPct (float): Take-profit %, optional
        tslPct (float): Trailing Stop-loss %, optional

    Returns:
        JSON with 'events' list and 'summary' performance stats.
    """
    try:
        data         = request.json or {}
        symbol       = data.get("symbol", "").strip()
        strategy_id  = data.get("strategyId", "").strip()
        timeframe    = data.get("timeframe", "15m")
        from_date    = data.get("fromDate", "").strip()
        to_date      = data.get("toDate", "").strip()
        sl_pct       = data.get("slPct")
        tp_pct       = data.get("tpPct")
        tsl_pct      = data.get("tslPct")

        # ------------------------------------------------------------------
        # Input validation
        # ------------------------------------------------------------------
        missing = [f for f, v in [("symbol", symbol), ("strategyId", strategy_id),
                                   ("fromDate", from_date), ("toDate", to_date)] if not v]
        if missing:
            return jsonify({"status": "error",
                            "message": f"Missing required fields: {', '.join(missing)}"}), 400

        try:
            from datetime import datetime as _dt
            _dt.strptime(from_date, "%Y-%m-%d")
            _dt.strptime(to_date,   "%Y-%m-%d")
        except ValueError:
            return jsonify({"status": "error",
                            "message": "fromDate and toDate must be YYYY-MM-DD"}), 400

        if sl_pct is not None:
            try:
                sl_pct = float(sl_pct)
                if sl_pct <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({"status": "error", "message": "slPct must be a positive number"}), 400

        if tp_pct is not None:
            try:
                tp_pct = float(tp_pct)
                if tp_pct <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({"status": "error", "message": "tpPct must be a positive number"}), 400

        if tsl_pct is not None:
            try:
                tsl_pct = float(tsl_pct)
                if tsl_pct <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({"status": "error", "message": "tslPct must be a positive number"}), 400

        capital_pct     = float(paper_store.get_setting("capital_pct",     "10.0"))
        virtual_capital = float(paper_store.get_setting("virtual_capital", "100000.0"))
        slippage        = float(paper_store.get_setting("slippage",        "0.05"))
        commission      = float(paper_store.get_setting("commission",      "20.0"))

        # ------------------------------------------------------------------
        # Delegate to ReplayEngine — all simulation logic lives there
        # ------------------------------------------------------------------
        from services.replay_engine import ReplayEngine

        result = ReplayEngine.run(
            symbol=symbol,
            strategy_id=strategy_id,
            timeframe=timeframe,
            from_date=from_date,
            to_date=to_date,
            sl_pct=sl_pct,
            tp_pct=tp_pct,
            tsl_pct=tsl_pct,
            capital_pct=capital_pct,
            virtual_capital=virtual_capital,
            slippage=slippage,
            commission=commission,
        )

        if not result["events"]:
            return jsonify({"status": "error",
                            "message": f"No data found for {symbol} [{from_date} → {to_date}]"}), 404

        # Save run into Vault
        try:
            import uuid
            run_id = str(uuid.uuid4())[:12]
            
            vault_summary = {
                "id": run_id,
                "strategyName": f"Replay: Strategy {strategy_id}",
                "timeframe": timeframe,
            }
            if "summary" in result:
                vault_summary.update(result["summary"])
                
            paper_store.save_run(
                run_id=run_id,
                run_type="REPLAY",
                symbol=symbol,
                strategy_id=strategy_id,
                summary=vault_summary,
                results={"events": result["events"]}
            )
            result["id"] = run_id
        except Exception as e:
            logger.error(f"Failed to auto-save replay to vault: {e}", exc_info=True)

        return jsonify({"status": "success", **result}), 200

    except Exception as exc:
        logger.error(f"run_replay failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": f"Replay failed: {exc}"}), 500


# ---------------------------------------------------------------------------
# Saved Runs (Vault)
# ---------------------------------------------------------------------------

@paper_bp.route("/runs", methods=["GET"])
def list_runs():
    """List all saved runs (metadata only)."""
    try:
        run_type = request.args.get("type", None)
        vault_items = paper_store.get_runs_list(run_type)
        return jsonify(vault_items), 200
    except Exception as exc:
        logger.error(f"list_runs failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch runs"}), 500

@paper_bp.route("/runs/<run_id>", methods=["GET"])
def get_run_details(run_id: str):
    """Get full details of a specific run."""
    try:
        run = paper_store.get_run(run_id)
        if not run:
            return jsonify({"status": "error", "message": "Run not found"}), 404
        return jsonify(run), 200
    except Exception as exc:
        logger.error(f"get_run_details failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch run"}), 500

@paper_bp.route("/runs/<run_id>", methods=["DELETE"])
def delete_run_endpoint(run_id: str):
    """Delete a saved run."""
    try:
        deleted = paper_store.delete_run(run_id)
        if not deleted:
            return jsonify({"status": "error", "message": "Run not found"}), 404
        return jsonify({"status": "success", "message": "Run deleted"}), 200
    except Exception as exc:
        logger.error(f"delete_run failed: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to delete run"}), 500

