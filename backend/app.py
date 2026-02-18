from flask import Flask, request, jsonify, g
from flask_cors import CORS
import time
import logging
import json
from collections import deque
from datetime import datetime

# Import Blueprints
from routes.backtest_routes import backtest_bp
from routes.market_routes import market_bp
from routes.optimization_routes import optimization_bp
from routes.risk_routes import risk_bp

# --- LOGGING SETUP ---
LOG_BUFFER = deque(maxlen=500)

class InMemoryHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            timestamp = datetime.now().strftime("%H:%M:%S")
            LOG_BUFFER.append({
                "ts": timestamp,
                "level": record.levelname,
                "msg": msg,
                "module": record.module
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
memory_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(memory_handler)

app = Flask(__name__)
CORS(app)

# --- REGISTER BLUEPRINTS ---
app.register_blueprint(backtest_bp, url_prefix='/api/v1/backtest')
app.register_blueprint(market_bp, url_prefix='/api/v1/market')
app.register_blueprint(optimization_bp, url_prefix='/api/v1/optimization')
app.register_blueprint(risk_bp, url_prefix='/api/v1/risk')

# --- MIDDLEWARE ---
@app.before_request
def start_timer():
    g.start = time.time()
    if request.path != '/api/v1/debug/logs':
        body = "No Body"
        if request.is_json:
            body = json.dumps(request.json)[:100]
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
    app.run(debug=True, port=5000)
