"""Optimization blueprint — HTTP handler only, no business logic.

All optimization logic lives in services/optimizer.py.
"""

from flask import Blueprint, request, jsonify
import logging

from services.optimizer import OptimizationEngine

optimization_bp = Blueprint("optimization", __name__)
logger = logging.getLogger(__name__)


@optimization_bp.route("/run", methods=["POST"])
def run_optimization():
    """Run Optuna hyperparameter optimisation for a strategy.

    Request JSON keys:
        symbol (str): Ticker symbol. Default 'NIFTY 50'.
        strategyId (str): Strategy identifier. Default '1'.
        ranges (dict): Parameter search space.
            Format: { 'paramName': { 'min': int, 'max': int, 'step': int } }
        n_trials (int): Number of Optuna trials. Default 30.

    Returns:
        JSON with 'grid' (list of trial results) and 'wfo' (empty list).
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol", "NIFTY 50")
        strategy_id = data.get("strategyId", "1")
        ranges = data.get("ranges", {})
        n_trials = int(data.get("n_trials", 30))
        scoring_metric = data.get("scoringMetric", "sharpe")

        if not isinstance(ranges, dict):
            return jsonify({"status": "error", "message": "ranges must be a dict"}), 400

        logger.info(f"Running Optuna Optimisation for {symbol} | Metric: {scoring_metric}")
        results = OptimizationEngine.run_optuna(
            symbol, strategy_id, ranges, request.headers, n_trials, scoring_metric
        )
        return jsonify(results), 200

    except Exception as exc:
        logger.error(f"Optimisation Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Optimisation failed"}), 500


@optimization_bp.route("/wfo", methods=["POST"])
def run_wfo():
    """Run Walk-Forward Optimisation for a strategy.

    Request JSON keys:
        symbol (str): Ticker symbol. Default 'NIFTY 50'.
        strategyId (str): Strategy identifier. Default '1'.
        ranges (dict): Parameter search space.
        wfoConfig (dict): WFO config with 'trainWindow' and 'testWindow'.

    Returns:
        JSON list of WFO window result dicts.
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol", "NIFTY 50")
        strategy_id = data.get("strategyId", "1")
        ranges = data.get("ranges", {})
        wfo_config = data.get("wfoConfig", {})
        full_results = data.get("fullResults", False)

        train_m = wfo_config.get("trainWindow", 6)
        test_m = wfo_config.get("testWindow", 2)
        logger.info(f"Running WFO for {symbol} | Train: {train_m}m, Test: {test_m}m | Full: {full_results}")
        
        if full_results:
            results = OptimizationEngine.generate_wfo_portfolio(
                symbol, strategy_id, ranges, wfo_config, request.headers
            )
        else:
            results = OptimizationEngine.run_wfo(
                symbol, strategy_id, ranges, wfo_config, request.headers
            )
        return jsonify(results), 200

    except Exception as exc:
        logger.error(f"WFO Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "WFO failed"}), 500

@optimization_bp.route("/auto-tune", methods=["POST"])
def auto_tune():
    """Run a quick Optuna search on the period before a given date."""
    try:
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        import pandas as pd
        import numpy as np
        from services.data_fetcher import DataFetcher
        from strategies import StrategyFactory
        import vectorbt as vbt

        data = request.json or {}
        symbol = data.get("symbol")
        strategy_id = data.get("strategyId")
        ranges = data.get("ranges", {})
        start_date_str = data.get("startDate")
        lookback = int(data.get("lookbackMonths", 12))
        metric = data.get("scoringMetric") or data.get("metric") or "sharpe"

        if not symbol or not strategy_id or not start_date_str:
            return jsonify({"status": "error", "message": "Missing required fields (symbol, strategyId, startDate)"}), 400

        # 1. Parse dates and calculate windows
        try:
            from datetime import timedelta
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            is_end = start_date - timedelta(days=1)
            is_start = is_end - relativedelta(months=lookback)
            
            logger.info(f"--- AUTO-TUNE PARAMS ---")
            logger.info(f"Symbol: {symbol} | Strategy: {strategy_id}")
            logger.info(f"Backtest Start: {start_date_str}")
            logger.info(f"Lookback Range: {is_start.date()} to {is_end.date()} ({lookback} months)")
        except Exception as e:
            logger.error(f"Auto-Tune Date Parsing Error: {e}")
            return jsonify({"status": "error", "message": f"Invalid date parameters: {str(e)}"}), 400

        # 2. Fetch data
        try:
            fetcher = DataFetcher(request.headers)
            df = fetcher.fetch_historical_data(symbol, from_date=str(is_start.date()), to_date=str(is_end.date()))
        except Exception as e:
            logger.error(f"Auto-Tune Fetch Error: {e}")
            return jsonify({"status": "error", "message": f"Failed to fetch data: {str(e)}"}), 503

        if df is None or df.empty:
            return jsonify({"status": "error", "message": f"No data found for {symbol} in period {is_start.date()} to {is_end.date()}"}), 404
            
        # 3. Slice and Clean Data
        try:
            # Mask is still useful if fetcher returned a slightly wider range (e.g. from cache)
            mask = (df.index >= pd.Timestamp(is_start)) & (df.index <= pd.Timestamp(is_end))
            is_df = df.loc[mask].dropna(subset=["Close"])
            
            logger.info(f"Data Loaded: {len(is_df)} total bars for optimization.")
            
            if len(is_df) < 20:
                return jsonify({"status": "error", "message": f"Insufficient data points ({len(is_df)}) for {lookback}m lookback before {start_date_str}."}), 400
        except Exception as e:
            logger.error(f"Auto-Tune Slicing Error: {e}")
            return jsonify({"status": "error", "message": f"Data processing error: {str(e)}"}), 500

        # 4. Run Optimization
        try:
            from services.optimizer import OptimizationEngine
            best_params = OptimizationEngine._find_best_params(is_df, strategy_id, ranges, metric)
        except Exception as e:
            logger.error(f"Auto-Tune Optimization Error: {e}")
            return jsonify({"status": "error", "message": f"Optimization engine error: {str(e)}"}), 500
        
        # 5. Calculate Final Score
        try:
            # StrategyFactory already imported locally at start of function
            strategy = StrategyFactory.get_strategy(strategy_id, best_params)
            entries, exits = strategy.generate_signals(is_df)
            pf = vbt.Portfolio.from_signals(is_df["Close"], entries, exits, freq="1D")
            
            if metric == "total_return":
                 score = pf.total_return()
            elif metric == "calmar":
                 score = pf.calmar_ratio() if callable(pf.calmar_ratio) else pf.calmar_ratio
            elif metric == "drawdown":
                 score = -abs(pf.max_drawdown())
            else:
                 score = pf.sharpe_ratio() if callable(pf.sharpe_ratio) else pf.sharpe_ratio

            if np.isnan(score):
                score = 0.0
        except Exception as e:
            logger.error(f"Auto-Tune Scoring Error: {e}")
            return jsonify({"status": "error", "message": f"Scoring calculation failed: {str(e)}"}), 500

        return jsonify({
            "bestParams": best_params,
            "score": round(float(score), 3),
            "period": f"{is_start.date()} to {is_end.date()}"
        }), 200

    except Exception as exc:
        logger.error(f"Auto-Tune Critical Failure: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": f"Auto-tune critical failure: {str(exc)}"}), 500


@optimization_bp.route("/monte-carlo", methods=["POST"])
def run_monte_carlo():
    """Run Monte Carlo price path simulations.

    Request JSON keys:
        symbol (str): Ticker symbol to base simulations on. Default 'NIFTY 50'.
        simulations (int): Number of paths to generate. Default 100.
        volMultiplier (float): Volatility multiplier. Default 1.0.

    Returns:
        JSON list of simulation path dicts (id, values).
    """
    try:
        from services.monte_carlo import MonteCarloEngine

        data = request.json or {}
        symbol = data.get("symbol", "NIFTY 50")
        simulations = int(data.get("simulations", 100))
        vol_mult = float(data.get("volMultiplier", 1.0))

        if simulations < 1 or simulations > 10000:
            return jsonify({"status": "error", "message": "simulations must be between 1 and 10000"}), 400
        if vol_mult <= 0:
            return jsonify({"status": "error", "message": "volMultiplier must be positive"}), 400

        logger.info(f"Running Monte Carlo: {simulations} paths for {symbol}")
        paths = MonteCarloEngine.run(simulations, vol_mult, request.headers, symbol)
        return jsonify(paths), 200

    except Exception as exc:
        logger.error(f"Monte Carlo Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Monte Carlo simulation failed"}), 500
