"""Backtest blueprint — HTTP handler only, no business logic.

All logic lives in services/backtest_engine.py and services/data_fetcher.py.

Multi-symbol support:
    If the request contains a ``symbols`` list with more than one entry, the
    route delegates to ``MultiSymbolFetcher`` + ``BacktestEngine.run_multi_symbol``.
    Single-symbol requests (``symbol`` key, or ``symbols`` with one entry) follow
    the original code path unchanged — fully backward compatible.
"""

from flask import Blueprint, request, jsonify
import logging
import random

from services.data_fetcher import DataFetcher
from services.backtest_engine import BacktestEngine
from services.strategy_store import StrategyStore
from services.multi_symbol_fetcher import MultiSymbolFetcher, parse_symbols_from_request

backtest_bp = Blueprint("backtest", __name__)
logger = logging.getLogger(__name__)


@backtest_bp.route("/run", methods=["POST"])
def run_backtest():
    """Run a backtest for a given symbol and strategy.

    Request JSON keys:
        symbol (str): Ticker symbol. Default 'NIFTY 50'.
        universe (str | None): Universe ID (overrides symbol if set).
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

        # --- Parse symbol(s): supports both "symbol" (single) and "symbols" (multi) ---
        # parse_symbols_from_request() is backward-compatible: if only one symbol is
        # present it returns a single-element list and the legacy path runs unchanged.
        try:
            symbols = parse_symbols_from_request(data)
        except ValueError as e:
            return jsonify({"status": "error", "message": str(e)}), 400

        # Basic per-symbol validation
        for sym in symbols:
            if not sym or len(sym) > 30:
                return jsonify({"status": "error", "message": f"Invalid symbol: '{sym}'"}), 400

        symbol = symbols[0]  # primary symbol (used in legacy single-symbol path)
        is_multi = len(symbols) > 1

        timeframe = data.get("timeframe", "1d")
        if timeframe not in ("1m", "5m", "15m", "1h", "1d"):
            return jsonify({"status": "error", "message": "Invalid timeframe"}), 400

        # Numeric parameter validation
        slippage_raw = data.get("slippage", 0.05)
        commission_raw = data.get("commission", 20)
        capital_raw = data.get("initial_capital", 100000)
        try:
            if float(slippage_raw) < 0:
                return jsonify({"status": "error", "message": "slippage must be >= 0"}), 400
            if float(commission_raw) < 0:
                return jsonify({"status": "error", "message": "commission must be >= 0"}), 400
            if float(capital_raw) <= 0:
                return jsonify({"status": "error", "message": "initial_capital must be > 0"}), 400
        except (TypeError, ValueError):
            return jsonify({"status": "error", "message": "slippage, commission, and initial_capital must be numbers"}), 400

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

        universe = data.get("universe")
        target = universe if universe else symbol
        strategy_id = data.get("strategyId")

        # --- Build config ---
        config = data.copy()

        # Merge saved strategy logic if it's a custom strategy
        if strategy_id and strategy_id not in ("1", "3"):
            saved = StrategyStore.get_by_id(strategy_id)
            if saved:
                logger.info(f"Loaded Custom Strategy Logic: {saved.get('name')}")
                for k, v in saved.items():
                    if k not in config or not config[k]:
                        config[k] = v

        # Apply defaults for missing keys
        defaults = {
            "slippage": 0.05,
            "commission": 20,
            "initial_capital": 100000,
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

        strategy_id = data.get("strategyId")
        logger.info(
            f"Backtest: {symbols} [{timeframe}] | Strategy: {strategy_id} | Multi: {is_multi}"
        )

        # ─────────────────────────────────────────────────────────────────────
        # MULTI-SYMBOL PATH
        # Triggered when the request contains symbols[] with 2+ entries.
        # Uses MultiSymbolFetcher to fetch all symbols in parallel,
        # then BacktestEngine.run_multi_symbol for equal-weight portfolio sim.
        # Result contains the same keys as single-symbol PLUS a perSymbol list.
        # ─────────────────────────────────────────────────────────────────────
        if is_multi:
            multi_fetcher = MultiSymbolFetcher(request.headers)
            universe = multi_fetcher.fetch(
                symbols=symbols,
                timeframe=timeframe,
                from_date=data.get("startDate"),
                to_date=data.get("endDate"),
            )
            if universe is None:
                return jsonify({
                    "status": "error",
                    "message": "Failed to fetch data for all requested symbols."
                }), 404

            results = BacktestEngine.run_multi_symbol(universe, symbols, strategy_id, config)
            if not results or results.get("metrics", {}).get("status") == "failed":
                return jsonify({"status": "error", "message": "Portfolio backtest failed."}), 500

            return jsonify({
                "id": f"bk-{random.randint(1000, 9999)}",
                "strategyName": config.get("name", data.get("strategyName", "Portfolio Strategy")),
                "symbol": ", ".join(symbols),
                "symbols": symbols,
                "timeframe": timeframe,
                "status": "completed",
                "syntheticData": False,
                "isMultiSymbol": True,
                **results,
            }), 200

        # ─────────────────────────────────────────────────────────────────────
        # SINGLE-SYMBOL PATH (unchanged from original)
        # ─────────────────────────────────────────────────────────────────────
        universe_id = data.get("universe")
        target = universe_id if universe_id else symbol
        logger.info(f"Backtest Target: {target} [{timeframe}] | Strategy: {strategy_id}")

        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(
            target,
            timeframe,
            from_date=data.get("startDate"),
            to_date=data.get("endDate")
        )

        # --- Intraday session filtering ---
        # Only filter when the timeframe is sub-daily AND startTime/endTime are provided.
        # For daily bars the index has no time component so filtering is skipped.
        start_time_str = data.get("startTime", "").strip()
        end_time_str = data.get("endTime", "").strip()
        if (
            timeframe in ("1m", "5m", "15m", "1h")
            and start_time_str
            and end_time_str
            and isinstance(df, __import__("pandas").DataFrame)
            and not df.empty
            and hasattr(df.index, "time")
        ):
            import datetime as _dt
            try:
                t_start = _dt.time.fromisoformat(start_time_str)
                t_end = _dt.time.fromisoformat(end_time_str)
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
            "symbol": target,
            "timeframe": timeframe,
            "status": "completed",
            "syntheticData": False,  # synthetic fallback was removed; data is always real or None
            **results,  # includes startDate, endDate from real data (Issue #15 fix)
        }
        return jsonify(response), 200

    except Exception as exc:
        logger.error(f"Backtest Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Internal server error"}), 500
