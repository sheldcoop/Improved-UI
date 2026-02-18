
from flask import Blueprint, request, jsonify
from engine import MonteCarloEngine
import logging

risk_bp = Blueprint('risk', __name__)
logger = logging.getLogger(__name__)

@risk_bp.route('/monte-carlo', methods=['POST'])
def run_monte_carlo():
    try:
        data = request.json
        simulations = int(data.get('simulations', 100))
        vol_mult = float(data.get('volatilityMultiplier', 1.0))
        
        logger.info(f"Running Monte Carlo: {simulations} sims, {vol_mult}x vol")
        
        # Pass headers for API Key resolution
        results = MonteCarloEngine.run(simulations, vol_mult, request.headers)
        return jsonify(results)
    except Exception as e:
        logger.error(f"MC Error: {e}")
        return jsonify({"error": str(e)}), 500
