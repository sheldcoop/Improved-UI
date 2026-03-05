"""Backtest blueprint — HTTP handler only, no business logic.

All logic lives in services/backtest_engine.py and services/data_fetcher.py.
"""

from flask import Blueprint, request, jsonify
import logging
import random
import pandas as pd

from services.data_fetcher import DataFetcher
from services.backtest_engine import BacktestEngine
from services.strategy_store import StrategyStore
from services import paper_store

backtest_bp = Blueprint("backtest", __name__)
logger = logging.getLogger(__name__)


@backtest_bp.route("/run", methods=["POST"])
def run_backtest():
    """Run a backtest for a given symbol and strategy.

    Request JSON keys:
        symbol (str): Ticker symbol. Default 'NIFTY 50'.
        timeframe (str): Candle interval. Default '1d'.
        strategyId (str): Strategy identifier.
        slippage (float): Slippage %. Default 0.05.
        commission (float): Commission per trade. Default 20.
        initial_capital (float): Starting capital. Default 100000.
        stopLossPct (float): Stop-loss %. 0 = disabled.
        takeProfitPct (float): Take-profit %. 0 = disabled.

    Returns:
        JSON backtest result with metrics, equityCurve, trades,
        monthlyReturns, startDate, endDate.
    """
    try:
        data = request.json or {}

        symbol = data.get("symbol", "NIFTY 50")
        if not symbol or len(symbol) > 30:
            return jsonify({"status": "error", "message": f"Invalid symbol: '{symbol}'"}), 400

        timeframe = data.get("timeframe", "1d")
        if timeframe not in ("1m", "5m", "15m", "1h", "1d"):
            return jsonify({"status": "error", "message": "Invalid timeframe"}), 400

        # Validate stop-loss / take-profit percentages
        sl_pct_raw = data.get("stopLossPct", 0)
        tp_pct_raw = data.get("takeProfitPct", 0)
        try:
            if float(sl_pct_raw) < 0:
                return jsonify({"status": "error", "message": "stopLossPct must be >= 0"}), 400
            if float(tp_pct_raw) < 0:
                return jsonify({"status": "error", "message": "takeProfitPct must be >= 0"}), 400
        except (TypeError, ValueError):
            return jsonify({"status": "error", "message": "stopLossPct and takeProfitPct must be numbers"}), 400

        # Validate slippage and commission — silent negatives / extremes produce wrong PnL
        slippage_raw = data.get("slippage", 0)
        commission_raw = data.get("commission", 20)
        try:
            slippage_val = float(slippage_raw)
            commission_val = float(commission_raw)
            if slippage_val < 0:
                return jsonify({"status": "error", "message": "slippage must be >= 0"}), 400
            if slippage_val > 100:
                return jsonify({"status": "error", "message": "slippage cannot exceed 100%"}), 400
            if commission_val < 0:
                return jsonify({"status": "error", "message": "commission must be >= 0"}), 400
        except (TypeError, ValueError):
            return jsonify({"status": "error", "message": "slippage and commission must be numbers"}), 400

        strategy_id = data.get("strategyId")

        # --- Build config ---
        config = data.copy()

        # Merge saved strategy logic if it's a custom strategy (not a built-in preset)
        if strategy_id and strategy_id not in ("1", "2", "3", "4", "5", "6", "7"):
            saved = StrategyStore.get_by_id(strategy_id)
            if saved:
                logger.info(f"Loaded Custom Strategy Logic: {saved.get('name')}")
                for k, v in saved.items():
                    if k not in config:  # Only fill MISSING keys — never overwrite explicit zeros
                        config[k] = v

        # Apply defaults for missing keys
        defaults = {
            "slippage": float(paper_store.get_setting("slippage", "0.05")),
            "commission": float(paper_store.get_setting("commission", "20")),
            "initial_capital": float(paper_store.get_setting("virtual_capital", "100000.0")),
            "pyramiding": paper_store.get_setting("pyramiding", "false").lower() == "true",
            "positionSizing": "percent",
            "positionSizeValue": float(paper_store.get_setting("capital_pct", "25.0")),
            "stopLossPct": 0,
            "takeProfitPct": 0,
            "entryRules": [],
            "exitRules": [],
            "filterRules": [],
        }
        for key, val in defaults.items():
            if key not in config:
                config[key] = val

        # For daily bars: always execute on the NEXT bar's open after signal fires.
        # This prevents look-ahead bias — on daily data you can't trade at today's
        # close the same moment the signal appears (bar isn't closed yet).
        # Intraday timeframes are exempt — live algos can react within the same bar.
        if timeframe == "1d" and "nextBarEntry" not in config:
            config["nextBarEntry"] = True

        logger.info(f"Backtest Target: {symbol} [{timeframe}] | Strategy: {strategy_id}")

        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(
            symbol,
            timeframe,
            from_date=data.get("startDate"),
            to_date=data.get("endDate")
        )

        # --- Intraday session filtering ---
        start_time_str = data.get("startTime", "").strip()
        end_time_str = data.get("endTime", "").strip()
        if (
            timeframe in ("1m", "5m", "15m", "1h")
            and start_time_str
            and end_time_str
            and isinstance(df, pd.DataFrame)
            and not df.empty
            and hasattr(df.index, "time")
        ):
            import datetime as _dt
            try:
                t_start = _dt.time.fromisoformat(start_time_str)
                t_end = _dt.time.fromisoformat(end_time_str)
                if t_start >= t_end:
                    return jsonify({"status": "error", "message": "startTime must be before endTime"}), 400
                bar_times = df.index.time
                df = df[(bar_times >= t_start) & (bar_times <= t_end)]
                logger.info(f"Session filter applied: {start_time_str}–{end_time_str}, bars remaining: {len(df)}")
            except ValueError:
                logger.warning(f"Invalid startTime/endTime format: '{start_time_str}' / '{end_time_str}' — skipping session filter")

        results = BacktestEngine.run(df, strategy_id, config)

        if not results or results.get("status") == "failed":
            msg = results.get("error", "No data found for symbol") if results else "No data found for symbol"
            return jsonify({"status": "error", "message": msg}), 404

        response = {
            "id": f"bk-{random.randint(1000, 9999)}",
            "strategyName": config.get("name", data.get("strategyName", "Vectorized Strategy")),
            "symbol": symbol,
            "timeframe": timeframe,
            "status": "completed",
            "syntheticData": False,
            **results,
        }
        
        # Save run into Vault
        try:
            from services.paper_store import save_run
            import uuid
            run_id = str(uuid.uuid4())[:12]
            response["id"] = run_id
            
            # The vault UI expects 'summary' specifically.
            vault_summary = {
                "id": run_id,
                "strategyName": response["strategyName"],
                "timeframe": timeframe,
            }
            if "summary" in results:
                vault_summary.update(results["summary"])
            else:
                vault_summary["totalTrades"] = len(results.get("trades", []))
                vault_summary["netPnl"] = sum(t.get("pnl", 0) for t in results.get("trades", []))
                
            save_run(
                run_id=run_id,
                run_type="BACKTEST",
                symbol=symbol,
                strategy_id=strategy_id,
                summary=vault_summary,
                results=response
            )
        except Exception as e:
            logger.error(f"Failed to auto-save backtest to vault: {e}", exc_info=True)

        return jsonify(response), 200

    except Exception as exc:
        logger.error(f"Backtest Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Internal server error"}), 500
