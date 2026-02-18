
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
        
        # Pass headers for API Key resolution
        results = OptimizationEngine.run_optuna(symbol, strategy_id, ranges, request.headers)
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
        
        # Pass headers for API Key resolution
        results = OptimizationEngine.run_wfo(symbol, strategy_id, ranges, wfo_config, request.headers)
        return jsonify(results)
    except Exception as e:
        logger.error(f"WFO Error: {e}")
        return jsonify({"error": str(e)}), 500
