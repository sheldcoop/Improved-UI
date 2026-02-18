from flask import Blueprint, request, jsonify
from engine import DataEngine
import logging

market_bp = Blueprint('market', __name__)
logger = logging.getLogger(__name__)

@market_bp.route('/option-chain', methods=['POST'])
def option_chain():
    try:
        data = request.json
        symbol = data.get('symbol')
        expiry = data.get('expiry')
        
        data_engine = DataEngine(request.headers)
        strikes = data_engine.fetch_option_chain(symbol, expiry)
        
        return jsonify(strikes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
