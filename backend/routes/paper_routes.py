"""Paper trading blueprint — HTTP handler only, no business logic.

All position state lives in services/paper_trading.py.
Ready for Dhan live order API integration (see DhanHQ-py-main/ reference).
"""

from flask import Blueprint, request, jsonify
import logging

from services.paper_trading import PaperTradingService

paper_bp = Blueprint("paper_trading", __name__)
logger = logging.getLogger(__name__)


@paper_bp.route("/positions", methods=["GET"])
def get_positions():
    """Return all current open paper trading positions.

    Returns:
        JSON array of position dicts.
    """
    try:
        positions = PaperTradingService.get_positions()
        return jsonify(positions), 200
    except Exception as exc:
        logger.error(f"Failed to fetch positions: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch positions"}), 500


@paper_bp.route("/positions", methods=["POST"])
def add_position():
    """Open a new paper trading position.

    Request JSON keys:
        symbol (str): Ticker symbol. Required.
        side (str): 'LONG' or 'SHORT'. Required.
        qty (int): Number of units. Required.
        avgPrice (float): Entry price. Required.

    Returns:
        JSON of the created position dict. 201 on success.
    """
    try:
        data = request.json or {}

        symbol = data.get("symbol")
        side = data.get("side")
        qty = data.get("qty")
        avg_price = data.get("avgPrice")

        if not symbol or not isinstance(symbol, str):
            return jsonify({"status": "error", "message": "symbol is required"}), 400
        if side not in ("LONG", "SHORT"):
            return jsonify({"status": "error", "message": "side must be LONG or SHORT"}), 400
        if not qty or not isinstance(qty, (int, float)) or qty <= 0:
            return jsonify({"status": "error", "message": "qty must be a positive number"}), 400
        if not avg_price or not isinstance(avg_price, (int, float)) or avg_price <= 0:
            return jsonify({"status": "error", "message": "avgPrice must be a positive number"}), 400

        position = PaperTradingService.add_position(symbol, side, int(qty), float(avg_price))
        return jsonify(position), 201

    except Exception as exc:
        logger.error(f"Failed to add position: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to add position"}), 500


@paper_bp.route("/positions/<position_id>", methods=["DELETE"])
def close_position(position_id: str):
    """Close (remove) a paper trading position by ID.

    Args:
        position_id: URL path parameter — position ID to close.

    Returns:
        JSON of the closed position dict. 404 if not found.
    """
    try:
        closed = PaperTradingService.close_position(position_id)
        if closed is None:
            return jsonify({"status": "error", "message": "Position not found"}), 404
        return jsonify(closed), 200
    except Exception as exc:
        logger.error(f"Failed to close position {position_id}: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to close position"}), 500
