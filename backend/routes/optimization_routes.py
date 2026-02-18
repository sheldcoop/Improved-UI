from flask import Blueprint, request, jsonify
from engine import OptimizationEngine
import logging

optimization_bp = Blueprint('optimization', __name__)
logger = logging.getLogger(__name__)

@optimization_bp.route('/run', methods=['POST'])
def run_optimization():
    try:
        # Default to NIFTY and RSI for demo if not specified
        symbol = request.json.get('symbol', 'NIFTY 50')
        strategy_id = request.json.get('strategyId', '1') 
        
        logger.info(f"Running Optimization for {symbol} - Strat {strategy_id}")
        
        results = OptimizationEngine.run(symbol, strategy_id)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Optimization Error: {e}")
        return jsonify({"error": str(e)}), 500
