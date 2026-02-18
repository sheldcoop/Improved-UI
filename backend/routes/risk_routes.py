"""Risk blueprint — HTTP handler only.

Monte Carlo is now also accessible via /api/v1/optimization/monte-carlo.
This route is kept for backward compatibility.
"""
from __future__ import annotations

from flask import Blueprint, request, jsonify
import logging

from services.monte_carlo import MonteCarloEngine

risk_bp = Blueprint("risk", __name__)
logger = logging.getLogger(__name__)


@risk_bp.route("/monte-carlo", methods=["POST"])
def run_monte_carlo():
    """Run Monte Carlo price path simulations.

    Request JSON keys:
        symbol (str): Ticker symbol to base simulations on. Default 'NIFTY 50'.
        simulations (int): Number of paths to generate. Default 100.
        volatilityMultiplier (float): Volatility multiplier. Default 1.0.

    Returns:
        JSON list of simulation path dicts (id, values).
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol", "NIFTY 50")
        simulations = int(data.get("simulations", 100))
        vol_mult = float(data.get("volatilityMultiplier", 1.0))

        if simulations < 1 or simulations > 10000:
            return jsonify({"status": "error", "message": "simulations must be between 1 and 10000"}), 400

        logger.info(f"Running Monte Carlo: {simulations} sims, {vol_mult}x vol, symbol={symbol}")
        results = MonteCarloEngine.run(simulations, vol_mult, request.headers, symbol)
        return jsonify(results), 200

    except Exception as exc:
        logger.error(f"Monte Carlo Error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Monte Carlo simulation failed"}), 500
