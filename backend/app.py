
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

_DOTENV_PATH = Path(__file__).with_name(".env")
_DOTENV_MTIME: Optional[float] = None

load_dotenv(dotenv_path=_DOTENV_PATH, override=True)

from flask import Flask, request, jsonify, g
from flask_cors import CORS
import time
import logging
import json
from collections import deque
from datetime import datetime
import os

# Import Blueprints
from routes.backtest_routes import backtest_bp
from routes.broker_routes import broker_bp
from routes.market_routes import market_bp
from routes.optimization_routes import optimization_bp
from routes.risk_routes import risk_bp
from routes.paper_routes import paper_bp
from routes.strategy_routes import strategy_bp

# --- LOGGING SETUP ---
LOG_BUFFER = deque(maxlen=500)

class InMemoryHandler(logging.Handler):
    def emit(self, record):
        try:
            # We don't use self.format(record) because that includes redundant prefixes
            # We want the clean message only
            msg = record.getMessage()
            if "/debug/logs" in msg or "GET /api/v1/debug/logs" in msg:
                return # Skip polling noise entirely
            
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            # Extract metadata if passed via logging.info(..., extra={"meta": {...}})
            meta = getattr(record, "meta", {})
            
            LOG_BUFFER.append({
                "ts": timestamp,
                "level": record.levelname,
                "module": record.module,
                "msg": msg,
                "meta": meta
            })
        except Exception:
            self.handleError(record)

logger = logging.getLogger()
logger.setLevel(logging.INFO)
for h in logger.handlers: logger.removeHandler(h)

console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(console_handler)

memory_handler = InMemoryHandler()
logger.addHandler(memory_handler)

app = Flask(__name__)
CORS(app)

# Ensure data directory exists
os.makedirs('data', exist_ok=True)

# --- REGISTER BLUEPRINTS ---
app.register_blueprint(backtest_bp, url_prefix='/api/v1/backtest')
app.register_blueprint(broker_bp, url_prefix='/api/v1/broker')
app.register_blueprint(market_bp, url_prefix='/api/v1/market')
app.register_blueprint(optimization_bp, url_prefix='/api/v1/optimization')
app.register_blueprint(risk_bp, url_prefix='/api/v1/risk')
app.register_blueprint(paper_bp, url_prefix='/api/v1/paper-trading')
app.register_blueprint(strategy_bp, url_prefix='/api/v1/strategies')

# --- MIDDLEWARE ---
@app.before_request
def start_timer():
    global _DOTENV_MTIME
    try:
        mtime = _DOTENV_PATH.stat().st_mtime
        if _DOTENV_MTIME is None or mtime != _DOTENV_MTIME:
            load_dotenv(dotenv_path=_DOTENV_PATH, override=True)
            _DOTENV_MTIME = mtime
    except Exception:
        pass
    g.start = time.time()
    if request.path != '/api/v1/debug/logs':
        body = "No Body"
        if request.is_json:
            parsed = request.get_json(silent=True)
            if parsed is not None:
                body = json.dumps(parsed)[:100]
        logging.info(f"➡ REQ: {request.method} {request.path} | Body: {body}")

@app.after_request
def log_request(response):
    if request.path != '/api/v1/debug/logs':
        diff = time.time() - g.start
        logging.info(f"⬅ RES: {response.status_code} | Time: {diff:.4f}s")
    return response

# --- SYSTEM ROUTES ---
@app.route('/api/v1/debug/logs', methods=['GET'])
def get_logs():
    return jsonify(list(LOG_BUFFER))

@app.route('/api/v1/debug/clear', methods=['POST'])
def clear_logs():
    LOG_BUFFER.clear()
    return jsonify({"status": "cleared"})

@app.route('/api/v1/validate-key', methods=['POST'])
def validate_key():
    return jsonify({"status": "valid", "message": "Connection successful"})

if __name__ == '__main__':
    logging.info("🚀 VectorBT Pro Backend (Modular) Starting...")
    app.run(debug=True, port=5001)
