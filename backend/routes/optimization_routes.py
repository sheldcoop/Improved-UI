
from flask import Blueprint, request, jsonify
from engine import OptimizationEngine
import logging

optimization_bp = Blueprint('optimization', __name__)
logger = logging.getLogger(__name__)

@optimization_bp.route('/run', methods=['POST'])
def run_optimization():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        strategy_id = data.get('strategyId', '1')
        ranges = data.get('ranges', {}) # Expected: { 'paramName': { min, max, step } }
        
        logger.info(f"Running Optuna Optimization for {symbol} | Params: {len(ranges)}")
        
        # Use the new run_optuna method
        results = OptimizationEngine.run_optuna(symbol, strategy_id, ranges)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Optimization Error: {e}")
        return jsonify({"error": str(e)}), 500

@optimization_bp.route('/wfo', methods=['POST'])
def run_wfo():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        strategy_id = data.get('strategyId', '1')
        ranges = data.get('ranges', {})
        wfo_config = data.get('wfoConfig', {}) # { trainWindow, testWindow }
        
        logger.info(f"Running Real WFO for {symbol}")
        
        # Use the new run_wfo method
        results = OptimizationEngine.run_wfo(symbol, strategy_id, ranges, wfo_config)
        return jsonify(results)
    except Exception as e:
        logger.error(f"WFO Error: {e}")
        return jsonify({"error": str(e)}), 500
