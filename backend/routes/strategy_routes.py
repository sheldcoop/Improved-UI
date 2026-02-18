"""Strategy blueprint — HTTP handler only, no business logic.

All persistence logic lives in services/strategy_store.py.
"""

from flask import Blueprint, request, jsonify
import logging

from services.strategy_store import StrategyStore

strategy_bp = Blueprint("strategies", __name__)
logger = logging.getLogger(__name__)


@strategy_bp.route("", methods=["GET"])
def get_strategies():
    """Return all saved strategies.

    Returns:
        JSON array of strategy dicts.
    """
    try:
        strategies = StrategyStore.load_all()
        return jsonify(strategies), 200
    except Exception as exc:
        logger.error(f"Failed to load strategies: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to load strategies"}), 500


@strategy_bp.route("", methods=["POST"])
def create_strategy():
    """Create or update a strategy.

    Request JSON: Strategy dict. Include 'id' to update existing.

    Returns:
        JSON of the saved strategy dict. 201 on create, 200 on update.
    """
    try:
        data = request.json or {}

        if not data.get("name") or not isinstance(data["name"], str):
            return jsonify({"status": "error", "message": "Strategy name is required"}), 400

        is_update = "id" in data and data["id"] != "new"
        saved = StrategyStore.save(data)
        status_code = 200 if is_update else 201
        return jsonify(saved), status_code

    except Exception as exc:
        logger.error(f"Failed to save strategy: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to save strategy"}), 500
