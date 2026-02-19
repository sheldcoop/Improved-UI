from flask import Blueprint, jsonify
import logging

strategy_bp = Blueprint("strategy", __name__)
logger = logging.getLogger(__name__)

@strategy_bp.route("/", methods=["GET"])
def get_strategies():
    """Return list of all available strategies and their parameters."""
    strategies = [
        {
            "id": "1",
            "name": "RSI Mean Reversion",
            "description": "Buy when RSI is oversold, sell when overbought.",
            "params": [
                {"key": "period", "label": "RSI Period", "min": 5, "max": 30, "default": 14},
                {"key": "lower", "label": "Oversold Level", "min": 10, "max": 40, "default": 30},
                {"key": "upper", "label": "Overbought Level", "min": 60, "max": 90, "default": 70}
            ]
        },
        {
            "id": "2",
            "name": "Bollinger Bands Mean Reversion",
            "description": "Buy below lower band, sell above middle band.",
            "params": [
                {"key": "period", "label": "Length", "min": 10, "max": 50, "default": 20},
                {"key": "std_dev", "label": "StdDev Multiplier", "min": 1.0, "max": 3.0, "default": 2.0, "step": 0.1}
            ]
        },
        {
            "id": "3",
            "name": "MACD Crossover",
            "description": "Buy when MACD line crosses above Signal line.",
            "params": [
                {"key": "fast", "label": "Fast Period", "min": 8, "max": 20, "default": 12},
                {"key": "slow", "label": "Slow Period", "min": 21, "max": 40, "default": 26},
                {"key": "signal", "label": "Signal Period", "min": 5, "max": 15, "default": 9}
            ]
        },
        {
            "id": "4",
            "name": "EMA Crossover",
            "description": "Trend following: Buy when Fast EMA crosses above Slow EMA.",
            "params": [
                {"key": "fast", "label": "Fast EMA", "min": 5, "max": 50, "default": 20},
                {"key": "slow", "label": "Slow EMA", "min": 51, "max": 200, "default": 50}
            ]
        },
        {
            "id": "5",
            "name": "Supertrend",
            "description": "Trend following using ATR-based trailing stop.",
            "params": [
                {"key": "period", "label": "ATR Period", "min": 7, "max": 20, "default": 10},
                {"key": "multiplier", "label": "Multiplier", "min": 1.0, "max": 5.0, "default": 3.0, "step": 0.1}
            ]
        },
        {
            "id": "6",
            "name": "Stochastic RSI",
            "description": "Mean reversion using Stochastic of RSI.",
            "params": [
                {"key": "rsi_period", "label": "RSI Period", "min": 10, "max": 30, "default": 14},
                {"key": "k_period", "label": "K Period", "min": 3, "max": 10, "default": 3},
                {"key": "d_period", "label": "D Period", "min": 3, "max": 10, "default": 3}
            ]
        },
        {
            "id": "7",
            "name": "ATR Channel Breakout",
            "description": "Volatility breakout: Buy above High + ATR*Mult.",
            "params": [
                {"key": "period", "label": "ATR Period", "min": 10, "max": 30, "default": 14},
                {"key": "multiplier", "label": "Distance Multiplier", "min": 1.0, "max": 4.0, "default": 2.0, "step": 0.1}
            ]
        }
    ]
    return jsonify(strategies), 200
