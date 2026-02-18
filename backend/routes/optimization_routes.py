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

        logger.info(f"Running WFO for {symbol} | Full: {full_results}")
        
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
    """Run a quick Optuna search on the period before a given date.
    
    Request JSON keys:
        symbol (str): Ticker symbol.
        strategyId (str): Strategy identifier.
        ranges (dict): Parameter search space.
        startDate (str): The backtest start date.
        lookbackMonths (int): Months of lookback before startDate. Default 12.
        scoringMetric (str): Metric to optimize. Default 'sharpe'.

    Returns:
        JSON with 'bestParams' (dict) and 'score' (float).
    """
    try:
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        import pandas as pd
        import numpy as np
        from services.data_fetcher import DataFetcher

        data = request.json or {}
        symbol = data.get("symbol")
        strategy_id = data.get("strategyId")
        ranges = data.get("ranges", {})
        start_date_str = data.get("startDate")
        lookback = int(data.get("lookbackMonths", 12))
        metric = data.get("scoringMetric", "sharpe")

        if not symbol or not strategy_id or not start_date_str:
            return jsonify({"status": "error", "message": "Missing required fields"}), 400

        # 1. Fetch data for lookback period
        try:
            from datetime import timedelta
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"status": "error", "message": "Invalid date format"}), 400
            
        # Strict logic: Lookback ends exactly 1 day before Backtest starts
        is_end = start_date - timedelta(days=1)
        is_start = is_end - relativedelta(months=lookback)
        
        logger.info(f"--- Temporal Separation Verification ---")
        logger.info(f"Auto-Tune Lookback: {is_start.date()} to {is_end.date()}")
        logger.info(f"Backtest Start:    {start_date.date()}")
        logger.info(f"----------------------------------------")
        
        # We need a DataFetcher to get data
        fetcher = DataFetcher(request.headers)
        # Fetch with buffer to ensure we cover the lookback
        df = fetcher.fetch_historical_data(symbol, from_date=str(is_start.date()), to_date=start_date_str)
        
        if df is None or df.empty:
            return jsonify({"status": "error", "message": "No data found for symbol"}), 404
            
        # Slice to in-sample period (the 'is' in is_df stands for In-Sample for Auto-Tune)
        mask = (df.index >= pd.Timestamp(is_start)) & (df.index <= pd.Timestamp(is_end))
        is_df = df.loc[mask]
        
        if len(is_df) < 20:
            return jsonify({"status": "error", "message": f"Insufficient data for {lookback}m lookback before {start_date_str}."}), 400

        # 2. Run Optimization on slice
        best_params = OptimizationEngine._find_best_params(is_df, strategy_id, ranges, metric)
        
        # 3. Get the score for best params
        # (Re-running briefly to get actual score value)
        from strategies import StrategyFactory
        import vectorbt as vbt
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

        return jsonify({
            "bestParams": best_params,
            "score": round(float(score), 3),
            "period": f"{is_start.date()} to {is_end.date()}"
        }), 200

    except Exception as exc:
        logger.error(f"Auto-Tune Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Auto-tune failed"}), 500


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
