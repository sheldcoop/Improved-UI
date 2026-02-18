from flask import Flask, request, jsonify
from flask_cors import CORS
from engine import DataEngine, StrategyEngine, RiskEngine
import random
import time

app = Flask(__name__)
CORS(app) # Enable CORS for all domains

# --- ROUTES ---

@app.route('/api/v1/validate-key', methods=['POST'])
def validate_key():
    """
    Real validation: Tries to fetch 1 data point from Alpha Vantage
    to see if the key allows access.
    """
    try:
        data_engine = DataEngine(request.headers)
        # We try to fetch a stable symbol like IBM or RELIANCE.BSE to check connectivity
        # We assume the DataEngine handles the fetch. 
        # We just need to check if it returns a non-empty dataframe.
        df = data_engine.fetch_historical_data("RELIANCE")
        
        if df is not None and not df.empty and len(df) > 0:
            return jsonify({"status": "valid", "message": "Connection successful"})
        else:
            return jsonify({"status": "invalid", "message": "Could not fetch data. Check key or limit."}), 400
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/strategies', methods=['GET', 'POST'])
def strategies():
    if request.method == 'GET':
        # Return mock strategies or fetch from DB
        return jsonify([
            {
                "id": "1",
                "name": "Moving Average Crossover",
                "description": "Simple SMA 10/50 Crossover",
                "assetClass": "EQUITY",
                "timeframe": "1d",
                "created": "2024-01-01",
                "entryRules": [],
                "exitRules": [],
                "stopLossPct": 2,
                "takeProfitPct": 5
            }
        ])
    elif request.method == 'POST':
        # Save strategy logic
        data = request.json
        return jsonify({"status": "success", "id": data.get("id")})

@app.route('/api/v1/backtest/run', methods=['POST'])
def run_backtest():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        strategy_id = data.get('strategyId')

        # Initialize Engines
        data_engine = DataEngine(request.headers)
        
        # 1. Fetch Data (Real or Mock)
        df = data_engine.fetch_historical_data(symbol)
        
        # 2. Run Strategy
        results = StrategyEngine.run_backtest(df, {"id": strategy_id})
        
        if not results:
             return jsonify({"error": "No data found for symbol"}), 404

        # Add Metadata
        response = {
            "id": f"bk-{random.randint(1000,9999)}",
            "strategyName": "SMA Crossover",
            "symbol": symbol,
            "timeframe": "1d",
            "startDate": "2023-01-01",
            "endDate": "2023-12-31",
            "status": "completed",
            **results
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/v1/market/option-chain', methods=['POST'])
def option_chain():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        expiry = data.get('expiry')

        data_engine = DataEngine(request.headers)
        strikes = data_engine.fetch_option_chain(symbol, expiry)
        
        return jsonify(strikes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/v1/risk/monte-carlo', methods=['POST'])
def monte_carlo():
    data = request.json
    simulations = data.get('simulations', 50)
    paths = RiskEngine.run_monte_carlo(simulations=simulations)
    return jsonify(paths)

@app.route('/api/v1/paper-trading/positions', methods=['GET'])
def paper_positions():
    # Return dummy positions
    return jsonify([
        {"id": "p1", "symbol": "NIFTY 22200 CE", "side": "LONG", "qty": 50, "avgPrice": 120, "ltp": 145, "pnl": 1250, "pnlPct": 20.8, "entryTime": "10:00", "status": "OPEN"},
        {"id": "p2", "symbol": "RELIANCE", "side": "LONG", "qty": 100, "avgPrice": 2900, "ltp": 2890, "pnl": -1000, "pnlPct": -0.3, "entryTime": "09:15", "status": "OPEN"}
    ])

@app.route('/api/v1/optimization/run', methods=['GET'])
def optimization():
    # Mock Optimization Grid
    grid = []
    for rsi in range(10, 21, 2):
        for sl in range(1, 4):
            grid.append({
                "paramSet": {"rsi": rsi, "stopLoss": sl},
                "sharpe": 1.5 + (random.random() * 0.5),
                "returnPct": 10 + (random.random() * 15),
                "drawdown": 5 + (random.random() * 5)
            })
            
    wfo = [
        {"period": "Q1 2023", "isOOS": True, "returnPct": 5.2, "sharpe": 1.8},
        {"period": "Q2 2023", "isOOS": True, "returnPct": -1.2, "sharpe": 0.6},
        {"period": "Q3 2023", "isOOS": True, "returnPct": 8.4, "sharpe": 2.1}
    ]
    
    return jsonify({"grid": grid, "wfo": wfo})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
