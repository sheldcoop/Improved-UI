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
        strategy_id = data.get('strategyId')
        
        # Config extraction
        config = {
            "slippage": data.get('slippage', 0.05),
            "commission": data.get('commission', 20),
            "initial_capital": data.get('capital', 100000)
        }

        logger.info(f"Route: Starting Backtest for {symbol} | Config: {config}")
        
        data_engine = DataEngine(request.headers)
        df = data_engine.fetch_historical_data(symbol)
        
        results = BacktestEngine.run(df, strategy_id, config)
        
        if not results:
             return jsonify({"error": "No data found for symbol"}), 404

        response = {
            "id": f"bk-{random.randint(1000,9999)}",
            "strategyName": "Vectorized Strategy",
            "symbol": symbol,
            "timeframe": "1d",
            "startDate": "2023-01-01",
            "endDate": "2023-12-31",
            "status": "completed",
            **results
        }
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Backtest Error: {str(e)}")
        return jsonify({"error": str(e)}), 500
