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

        if not isinstance(ranges, dict):
            return jsonify({"status": "error", "message": "ranges must be a dict"}), 400

        logger.info(f"Running Optuna Optimisation for {symbol} | Params: {len(ranges)}")
        results = OptimizationEngine.run_optuna(
            symbol, strategy_id, ranges, request.headers, n_trials
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

        logger.info(f"Running WFO for {symbol}")
        results = OptimizationEngine.run_wfo(
            symbol, strategy_id, ranges, wfo_config, request.headers
        )
        return jsonify(results), 200

    except Exception as exc:
        logger.error(f"WFO Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "WFO failed"}), 500


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
