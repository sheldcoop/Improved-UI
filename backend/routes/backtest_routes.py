from flask import Blueprint, request, jsonify
from engine import DataEngine, BacktestEngine
import logging
import random

backtest_bp = Blueprint('backtest', __name__)
logger = logging.getLogger(__name__)

@backtest_bp.route('/run', methods=['POST'])
def run_backtest():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        universe = data.get('universe') # New param
        target = universe if universe else symbol
        
        timeframe = data.get('timeframe', '1d')
        
        # Strategy Config (can be ID or full object)
        strategy_id = data.get('strategyId')
        
        # Combine config
        config = {
            "slippage": data.get('slippage', 0.05),
            "commission": data.get('commission', 20),
            "initial_capital": data.get('initial_capital', 100000),
            "stopLossPct": data.get('stopLossPct', 0),
            "takeProfitPct": data.get('takeProfitPct', 0),
            # Pass rules if available
            "entryRules": data.get('entryRules', []),
            "exitRules": data.get('exitRules', []),
            "filterRules": data.get('filterRules', [])
        }

        logger.info(f"Backtest Target: {target} [{timeframe}]")
        
        data_engine = DataEngine(request.headers)
        df = data_engine.fetch_historical_data(target, timeframe)
        
        results = BacktestEngine.run(df, strategy_id, config)
        
        if not results:
             return jsonify({"error": "No data found for symbol"}), 404

        response = {
            "id": f"bk-{random.randint(1000,9999)}",
            "strategyName": data.get('strategyName', "Vectorized Strategy"),
            "symbol": target,
            "timeframe": timeframe,
            "startDate": "2023-01-01", # simplified
            "endDate": "2024-01-01",
            "status": "completed",
            **results
        }
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Backtest Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
