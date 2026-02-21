"""Optimization blueprint — HTTP handler only, no business logic.

All optimization logic lives in services/optimizer.py.
"""

from flask import Blueprint, request, jsonify
import logging

from services.optimizer import OptimizationEngine
from services.wfo_engine import WFOEngine

optimization_bp = Blueprint("optimization", __name__)
logger = logging.getLogger(__name__)


# helper validator for optimisation payloads

def _validate_optimization_payload(data: dict) -> None:
    """Raise ValueError if payload is missing required fields or types.

    This keeps the route handlers lean and ensures consistent error
    messages early in the request lifecycle.
    """
    if not data.get("symbol"):
        raise ValueError("symbol is required")
    if not data.get("strategyId"):
        raise ValueError("strategyId is required")
    ranges = data.get("ranges")
    if ranges is None:
        raise ValueError("ranges is required")
    if not isinstance(ranges, dict):
        raise ValueError("ranges must be a dict")

    # optional but type checked
    if "startDate" in data and data["startDate"] is not None:
        # simple YYYY-MM-DD check
        import re
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", data["startDate"]):
            raise ValueError("startDate must be YYYY-MM-DD")
    if "endDate" in data and data["endDate"] is not None:
        import re
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", data["endDate"]):
            raise ValueError("endDate must be YYYY-MM-DD")


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
        logger.info(f"DEBUG: run_optimization payload: {data}")

        # perform schema validation, failing fast
        try:
            _validate_optimization_payload(data)
        except ValueError as ve:
            return jsonify({"status": "error", "message": str(ve)}), 400

        symbol = data.get("symbol", "NIFTY 50")
        strategy_id = data.get("strategyId", "1")
        ranges = data.get("ranges", {})
        # Critical Fix: Pass root-level dates to Optuna ranges for fetcher
        ranges["startDate"] = data.get("startDate")
        ranges["endDate"] = data.get("endDate")
        timeframe = data.get("timeframe", "1d")
        n_trials = int(data.get("n_trials", 30))
        scoring_metric = data.get("scoringMetric", "sharpe")
        reproducible = data.get("reproducible", False)
        config = data.get("config", {})
        risk_ranges = data.get("riskRanges")  # optional second-phase search space

        logger.info(f"Running Optuna Optimisation for {symbol} | Metric: {scoring_metric} | Timeframe: {timeframe} | Reproducible: {reproducible}")
        results = OptimizationEngine.run_optuna(
            symbol,
            strategy_id,
            ranges,
            request.headers,
            n_trials,
            scoring_metric,
            reproducible,
            config=config,
            timeframe=timeframe,
            risk_ranges=risk_ranges,
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
        reproducible (bool): Whether to use a fixed seed. Default False.

    Returns:
        JSON list of WFO window result dicts.
    """
    try:
        data = request.json or {}
        # basic validation
        if not data.get("symbol"):
            return jsonify({"status": "error", "message": "symbol is required"}), 400
        if not data.get("strategyId"):
            return jsonify({"status": "error", "message": "strategyId is required"}), 400
        if not isinstance(data.get("ranges", {}), dict):
            return jsonify({"status": "error", "message": "ranges must be a dict"}), 400

        symbol = data.get("symbol", "NIFTY 50")
        strategy_id = data.get("strategyId", "1")
        ranges = data.get("ranges", {})
        wfo_config = data.get("wfoConfig", {})
        # Critical Fix: Ensure dates are in WFO config without overwriting existing values with None
        wfo_config["startDate"] = wfo_config.get("startDate") or data.get("startDate")
        wfo_config["endDate"] = wfo_config.get("endDate") or data.get("endDate")
        ranges["reproducible"] = data.get("reproducible", False)
        
        full_results = data.get("fullResults", False)

        train_m = int(wfo_config.get("trainWindow", 6))
        test_m = int(wfo_config.get("testWindow", 2))
        # Validation: Minimum window sizes
        if train_m < 1:
            return jsonify({
                "status": "error",
                "message": "Train Window must be at least 1 month."
            }), 400
        if test_m < 1:
            return jsonify({
                "status": "error",
                "message": "Test Window must be at least 1 month."
            }), 400

        logger.info(f"Running WFO for {symbol} | Train: {train_m}m, Test: {test_m}m | Full: {full_results}")
        
        if full_results:
            results = WFOEngine.generate_wfo_portfolio(
                symbol, strategy_id, ranges, wfo_config, request.headers
            )
        else:
            results = WFOEngine.run_wfo(
                symbol, strategy_id, ranges, wfo_config, request.headers
            )
        return jsonify(results), 200

    except Exception as exc:
        logger.error(f"WFO Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "WFO failed"}), 500



@optimization_bp.route("/oos-validate", methods=["POST"])
def run_oos_validate():
    """Run Out-Of-Sample validation on selected Optuna parameter sets.
    
    Request JSON keys:
        symbol (str): Ticker symbol.
        strategyId (str): Strategy ID.
        paramSets (list[dict]): The array of parameter dicts to test.
        startDate (str): Start date for the test window.
        endDate (str): End date for the test window.
        
    Returns:
        JSON list of result objects matching the paramSets.
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol")
        strategy_id = data.get("strategyId")
        param_sets = data.get("paramSets", [])
        start_date = data.get("startDate")
        end_date = data.get("endDate")
        timeframe = data.get("timeframe", "1d")
        config = data.get("config", {})
        
        if not symbol or not strategy_id or not start_date or not end_date:
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
            
        if not param_sets or not isinstance(param_sets, list):
            return jsonify({"status": "error", "message": "Valid paramSets list is required"}), 400
            
        logger.info(f"OOS Validation: {symbol} ({timeframe}) | Strategy: {strategy_id} | Sets: {len(param_sets)}")
        
        results = OptimizationEngine.run_oos_validation(
            symbol, strategy_id, param_sets, start_date, end_date, timeframe, request.headers, config=config
        )
        
        return jsonify(results), 200
        
    except Exception as exc:
        logger.error(f"OOS Validation Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": f"OOS Validation failed: {str(exc)}"}), 500


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
