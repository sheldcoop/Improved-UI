
from flask import Blueprint, request, jsonify
from engine import DataEngine, BacktestEngine
import logging
import random
import json
import os

backtest_bp = Blueprint('backtest', __name__)
logger = logging.getLogger(__name__)

DATA_FILE = 'data/strategies.json'

def get_saved_strategy(strategy_id):
    if not os.path.exists(DATA_FILE):
        return None
    try:
        with open(DATA_FILE, 'r') as f:
            strategies = json.load(f)
            return next((s for s in strategies if s['id'] == strategy_id), None)
    except:
        return None

@backtest_bp.route('/run', methods=['POST'])
def run_backtest():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        universe = data.get('universe') 
        target = universe if universe else symbol
        
        timeframe = data.get('timeframe', '1d')
        strategy_id = data.get('strategyId')
        
        # 1. Base configuration from request
        config = data.copy()
        
        # 2. If it's a Custom Strategy (not "1" or "3"), load logic from file
        if strategy_id and strategy_id not in ["1", "3"]:
            saved_strat = get_saved_strategy(strategy_id)
            if saved_strat:
                logger.info(f"Loaded Custom Strategy Logic: {saved_strat['name']}")
                # Merge saved logic (Entry/Exit rules) into config
                # We prioritize request config (overrides) over saved config
                for k, v in saved_strat.items():
                    if k not in config or not config[k]:
                        config[k] = v
        
        # 3. Ensure defaults for core parameters if still missing
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

        logger.info(f"Backtest Target: {target} [{timeframe}] | Strategy: {strategy_id}")
        
        data_engine = DataEngine(request.headers)
        df = data_engine.fetch_historical_data(target, timeframe)
        
        results = BacktestEngine.run(df, strategy_id, config)
        
        if not results:
             return jsonify({"error": "No data found for symbol"}), 404

        response = {
            "id": f"bk-{random.randint(1000,9999)}",
            "strategyName": config.get('name', data.get('strategyName', "Vectorized Strategy")),
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
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
