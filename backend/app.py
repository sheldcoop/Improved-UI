from flask import Flask, request, jsonify, g
from flask_cors import CORS
from engine import DataEngine, StrategyEngine, RiskEngine
import random
import time
import logging
import json
import traceback
from collections import deque
from datetime import datetime

# --- GOD LEVEL LOGGING SETUP ---
# We store the last 500 log lines in memory to serve to the frontend
LOG_BUFFER = deque(maxlen=500)

class InMemoryHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_entry = {
                "ts": timestamp,
                "level": record.levelname,
                "msg": msg,
                "module": record.module
            }
            LOG_BUFFER.append(log_entry)
        except Exception:
            self.handleError(record)

# Configure Root Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)
# Remove default handlers to avoid duplicates if reloaded
for h in logger.handlers:
    logger.removeHandler(h)

# Add Console Handler (for terminal)
console_handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# Add Memory Handler (for Frontend UI)
memory_handler = InMemoryHandler()
memory_handler.setFormatter(formatter)
logger.addHandler(memory_handler)

app = Flask(__name__)
CORS(app)

# --- REQUEST INTERCEPTORS ---

@app.before_request
def start_timer():
    g.start = time.time()
    # Log incoming request details
    if request.path != '/api/v1/debug/logs': # Don't log the log polling itself
        body_preview = "No Body"
        if request.is_json:
            body_preview = json.dumps(request.json)[:100] + "..." if len(json.dumps(request.json)) > 100 else json.dumps(request.json)
        
        logging.info(f"➡ REQ: {request.method} {request.path} | Body: {body_preview}")

@app.after_request
def log_request(response):
    if request.path != '/api/v1/debug/logs':
        diff = time.time() - g.start
        status_code = response.status_code
        logging.info(f"⬅ RES: {status_code} | Time: {diff:.4f}s")
    return response

# --- DEBUG ROUTES ---

@app.route('/api/v1/debug/logs', methods=['GET'])
def get_logs():
    """Returns the in-memory server logs to the frontend"""
    return jsonify(list(LOG_BUFFER))

@app.route('/api/v1/debug/clear', methods=['POST'])
def clear_logs():
    LOG_BUFFER.clear()
    logging.info("System Logs Cleared by User")
    return jsonify({"status": "cleared"})

# --- MAIN ROUTES ---

@app.route('/api/v1/validate-key', methods=['POST'])
def validate_key():
    try:
        logging.info("Validating Alpha Vantage Key...")
        data_engine = DataEngine(request.headers)
        df = data_engine.fetch_historical_data("RELIANCE")
        
        if df is not None and not df.empty and len(df) > 0:
            logging.info("Key Validation Successful.")
            return jsonify({"status": "valid", "message": "Connection successful"})
        else:
            logging.warning("Key Validation Failed: Data Empty")
            return jsonify({"status": "invalid", "message": "Could not fetch data. Check key or limit."}), 400
            
    except Exception as e:
        logging.error(f"Validation Error: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/strategies', methods=['GET', 'POST'])
def strategies():
    if request.method == 'GET':
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
        data = request.json
        logging.info(f"Saving Strategy: {data.get('name')}")
        return jsonify({"status": "success", "id": data.get("id")})

@app.route('/api/v1/backtest/run', methods=['POST'])
def run_backtest():
    try:
        data = request.json
        symbol = data.get('symbol', 'NIFTY 50')
        strategy_id = data.get('strategyId')
        
        logging.info(f"Starting Backtest for {symbol} using Strategy {strategy_id}")

        data_engine = DataEngine(request.headers)
        
        # 1. Fetch Data
        df = data_engine.fetch_historical_data(symbol)
        
        # 2. Run Strategy
        logging.info("Executing Strategy Engine logic...")
        results = StrategyEngine.run_backtest(df, {"id": strategy_id})
        
        if not results:
             logging.error("Backtest produced no results.")
             return jsonify({"error": "No data found for symbol"}), 404

        logging.info(f"Backtest Completed. Return: {results['metrics']['totalReturnPct']}%")

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
        logging.error(f"Backtest CRITICAL FAIL: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/api/v1/market/option-chain', methods=['POST'])
def option_chain():
    try:
        data = request.json
        symbol = data.get('symbol')
        expiry = data.get('expiry')
        logging.info(f"Fetching Option Chain: {symbol} [{expiry}]")

        data_engine = DataEngine(request.headers)
        strikes = data_engine.fetch_option_chain(symbol, expiry)
        
        return jsonify(strikes)
    except Exception as e:
        logging.error(f"Option Chain Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/v1/risk/monte-carlo', methods=['POST'])
def monte_carlo():
    data = request.json
    simulations = data.get('simulations', 50)
    logging.info(f"Running Monte Carlo: {simulations} sims")
    paths = RiskEngine.run_monte_carlo(simulations=simulations)
    return jsonify(paths)

@app.route('/api/v1/paper-trading/positions', methods=['GET'])
def paper_positions():
    return jsonify([
        {"id": "p1", "symbol": "NIFTY 22200 CE", "side": "LONG", "qty": 50, "avgPrice": 120, "ltp": 145, "pnl": 1250, "pnlPct": 20.8, "entryTime": "10:00", "status": "OPEN"},
        {"id": "p2", "symbol": "RELIANCE", "side": "LONG", "qty": 100, "avgPrice": 2900, "ltp": 2890, "pnl": -1000, "pnlPct": -0.3, "entryTime": "09:15", "status": "OPEN"}
    ])

@app.route('/api/v1/optimization/run', methods=['GET'])
def optimization():
    logging.info("Starting Optimization Grid...")
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
    logging.info("Optimization Complete.")
    return jsonify({"grid": grid, "wfo": wfo})

if __name__ == '__main__':
    logging.info("🚀 VectorBT Pro Backend Starting on Port 5000...")
    app.run(debug=True, port=5000)
