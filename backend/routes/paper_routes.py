
from flask import Blueprint, jsonify
import random

paper_bp = Blueprint('paper_trading', __name__)

@paper_bp.route('/positions', methods=['GET'])
def get_positions():
    # Simulate fetching positions from a broker execution engine
    # In production, this would query a database or broker API
    
    positions = [
        { 
            "id": "p1", 
            "symbol": "NIFTY 50", 
            "side": "LONG", 
            "qty": 50, 
            "avgPrice": 22100.0, 
            "ltp": 22180.5, 
            "pnl": 4025.0, 
            "pnlPct": 0.36, 
            "entryTime": "10:30 AM", 
            "status": "OPEN" 
        },
        { 
            "id": "p2", 
            "symbol": "BANKNIFTY", 
            "side": "SHORT", 
            "qty": 15, 
            "avgPrice": 46600.0, 
            "ltp": 46550.0, 
            "pnl": 750.0, 
            "pnlPct": 0.11, 
            "entryTime": "11:15 AM", 
            "status": "OPEN" 
        },
        { 
            "id": "p3", 
            "symbol": "RELIANCE", 
            "side": "LONG", 
            "qty": 100, 
            "avgPrice": 2950.0, 
            "ltp": 2945.0, 
            "pnl": -500.0, 
            "pnlPct": -0.17, 
            "entryTime": "09:45 AM", 
            "status": "OPEN" 
        }
    ]
    
    return jsonify(positions)
