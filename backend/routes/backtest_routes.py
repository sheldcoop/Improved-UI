"""Backtest blueprint — HTTP handler only, no business logic.

All logic lives in services/backtest_engine.py and services/data_fetcher.py.
"""

from flask import Blueprint, request, jsonify
import logging
import random

from services.data_fetcher import DataFetcher
from services.backtest_engine import BacktestEngine
from services.strategy_store import StrategyStore

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

        # --- Input Validation (Rule 8) ---
        symbol = data.get("symbol", "NIFTY 50")
        if not symbol or not isinstance(symbol, str) or len(symbol) > 20:
            return jsonify({"status": "error", "message": "Invalid symbol"}), 400

        timeframe = data.get("timeframe", "1d")
        if timeframe not in ("1m", "5m", "15m", "1h", "1d"):
            return jsonify({"status": "error", "message": "Invalid timeframe"}), 400

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

        logger.info(f"Backtest Target: {target} [{timeframe}] | Strategy: {strategy_id}")

        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(target, timeframe)

        results = BacktestEngine.run(df, strategy_id, config)

        if not results:
            return jsonify({"status": "error", "message": "No data found for symbol"}), 404

        response = {
            "id": f"bk-{random.randint(1000, 9999)}",
            "strategyName": config.get("name", data.get("strategyName", "Vectorized Strategy")),
            "symbol": target,
            "timeframe": timeframe,
            "status": "completed",
            **results,  # includes startDate, endDate from real data (Issue #15 fix)
        }
        return jsonify(response), 200

    except Exception as exc:
        logger.error(f"Backtest Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Internal server error"}), 500
