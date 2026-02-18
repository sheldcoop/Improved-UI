
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
        universe = data.get('universe') 
        target = universe if universe else symbol
        
        timeframe = data.get('timeframe', '1d')
        strategy_id = data.get('strategyId')
        
        # CRITICAL FIX: Use the entire data payload as config.
        # This ensures dynamic params (rsi_period, fast_ma, etc.) are passed to the StrategyFactory.
        config = data.copy()
        
        # Ensure defaults for core parameters if missing
        defaults = {
            "slippage": 0.05,
            "commission": 20,
            "initial_capital": 100000,
            "stopLossPct": 0,
            "takeProfitPct": 0,
            "entryRules": [],
            "exitRules": [],
            "filterRules": []
        }
        
        for key, val in defaults.items():
            if key not in config:
                config[key] = val

        logger.info(f"Backtest Target: {target} [{timeframe}] | Strategy: {strategy_id} | Params: {list(config.keys())}")
        
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
            "startDate": "2023-01-01", 
            "endDate": "2024-01-01",
            "status": "completed",
            **results
        }
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Backtest Error: {str(e)}")
        return jsonify({"error": str(e)}), 500
