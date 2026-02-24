from flask import Blueprint, jsonify, request
import logging
import os
import json
import re

from services.strategy_store import StrategyStore
from services.data_fetcher import DataFetcher
from strategies import StrategyFactory

strategy_bp = Blueprint("strategy", __name__)
logger = logging.getLogger(__name__)


PRESET_STRATEGIES = [
    {
        "id": "1",
        "name": "RSI Mean Reversion",
        "description": "Buy when RSI is oversold, sell when overbought.",
        "params": [
            {"name": "period", "label": "RSI Period", "min": 5, "max": 30, "default": 14},
            {"name": "lower", "label": "Oversold Level", "min": 10, "max": 40, "default": 30},
            {"name": "upper", "label": "Overbought Level", "min": 60, "max": 90, "default": 70}
        ]
    },
    {
        "id": "2",
        "name": "Bollinger Bands Mean Reversion",
        "description": "Buy below lower band, sell above middle band.",
        "params": [
            {"name": "period", "label": "Length", "min": 10, "max": 50, "default": 20},
            {"name": "std_dev", "label": "StdDev Multiplier", "min": 1.0, "max": 3.0, "default": 2.0, "step": 0.1}
        ]
    },
    {
        "id": "3",
        "name": "MACD Crossover",
        "description": "Buy when MACD line crosses above Signal line.",
        "params": [
            {"name": "fast", "label": "Fast Period", "min": 8, "max": 20, "default": 12},
            {"name": "slow", "label": "Slow Period", "min": 21, "max": 40, "default": 26},
            {"name": "signal", "label": "Signal Period", "min": 5, "max": 15, "default": 9}
        ]
    },
    {
        "id": "4",
        "name": "EMA Crossover",
        "description": "Trend following: Buy when Fast EMA crosses above Slow EMA.",
        "params": [
            {"name": "fast", "label": "Fast EMA", "min": 5, "max": 50, "default": 20},
            {"name": "slow", "label": "Slow EMA", "min": 51, "max": 200, "default": 50}
        ]
    },
    {
        "id": "5",
        "name": "Supertrend",
        "description": "Trend following using ATR-based trailing stop.",
        "params": [
            {"name": "period", "label": "ATR Period", "min": 7, "max": 20, "default": 10},
            {"name": "multiplier", "label": "Multiplier", "min": 1.0, "max": 5.0, "default": 3.0, "step": 0.1}
        ]
    },
    {
        "id": "6",
        "name": "Stochastic RSI",
        "description": "Mean reversion using Stochastic of RSI.",
        "params": [
            {"name": "rsi_period", "label": "RSI Period", "min": 10, "max": 30, "default": 14},
            {"name": "k_period", "label": "K Period", "min": 3, "max": 10, "default": 3},
            {"name": "d_period", "label": "D Period", "min": 3, "max": 10, "default": 3}
        ]
    },
    {
        "id": "7",
        "name": "ATR Channel Breakout",
        "description": "Volatility breakout: Buy above High + ATR*Mult.",
        "params": [
            {"name": "period", "label": "ATR Period", "min": 10, "max": 30, "default": 14},
            {"name": "multiplier", "label": "Distance Multiplier", "min": 1.0, "max": 4.0, "default": 2.0, "step": 0.1}
        ]
    }
]


@strategy_bp.route("/", methods=["GET", "POST"])
def strategies_root():
    """GET: list preset strategies. POST: save a custom strategy."""
    if request.method == "GET":
        return jsonify(PRESET_STRATEGIES), 200

    # POST — save strategy
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400

    name = data.get("name", "").strip()
    if not name:
        return jsonify({"status": "error", "message": "Strategy name is required"}), 400

    try:
        saved = StrategyStore.save(data)
        logger.info(f"Saved strategy: {saved.get('name')} ({saved.get('id')})")
        return jsonify({"status": "ok", "strategy": saved}), 200
    except Exception as exc:
        logger.error(f"Failed to save strategy: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to save strategy"}), 500


@strategy_bp.route("/saved", methods=["GET"])
def list_saved_strategies():
    """Return all user-saved (custom) strategies."""
    try:
        strategies = StrategyStore.load_all()
        return jsonify(strategies), 200
    except Exception as exc:
        logger.error(f"Failed to load saved strategies: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to load strategies"}), 500


@strategy_bp.route("/<strategy_id>", methods=["DELETE"])
def delete_strategy(strategy_id: str):
    """Delete a saved strategy by ID."""
    try:
        found = StrategyStore.delete_by_id(strategy_id)
        if not found:
            return jsonify({"status": "error", "message": "Strategy not found"}), 404
        return jsonify({"status": "ok"}), 200
    except Exception as exc:
        logger.error(f"Failed to delete strategy {strategy_id}: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to delete strategy"}), 500


@strategy_bp.route("/preview", methods=["POST"])
def preview_signals():
    """Generate a lightweight signal preview for the last 100 bars.

    Returns entry/exit counts and dates without running a full backtest.
    """
    data = request.json or {}
    symbol = data.get("symbol", "NIFTY 50")
    timeframe = data.get("timeframe", "1d")

    if not symbol or not isinstance(symbol, str) or len(symbol) > 30:
        return jsonify({"status": "error", "message": "Invalid symbol"}), 400
    if timeframe not in ("1m", "5m", "15m", "1h", "1d"):
        return jsonify({"status": "error", "message": "Invalid timeframe"}), 400

    try:
        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(symbol, timeframe)

        if df is None or df.empty:
            return jsonify({"status": "error", "message": "No data available for symbol"}), 404

        # Intraday session filtering (same logic as backtest_routes)
        start_time_str = data.get("startTime", "").strip()
        end_time_str = data.get("endTime", "").strip()
        if (
            timeframe in ("1m", "5m", "15m", "1h")
            and start_time_str
            and end_time_str
            and hasattr(df.index, "time")
        ):
            import datetime as _dt
            try:
                t_start = _dt.time.fromisoformat(start_time_str)
                t_end = _dt.time.fromisoformat(end_time_str)
                bar_times = df.index.time
                df = df[(bar_times >= t_start) & (bar_times <= t_end)]
            except ValueError:
                pass  # bad format — ignore and use all bars

        # Use only the last 100 bars for speed
        df = df.tail(100).copy()
        df.columns = [c.lower() for c in df.columns]

        strategy_id = data.get("strategyId", None)
        strategy = StrategyFactory.get_strategy(strategy_id, data)
        entries, exits = strategy.generate_signals(df)

        # CODE mode returns (None, None) on error — surface it to the user
        if entries is None or exits is None:
            return jsonify({"status": "error", "message": "Signal generation failed — check your Python code for errors"}), 500

        # Boolify and get dates
        import numpy as np
        entries = entries.fillna(False).astype(bool)
        exits = exits.fillna(False).astype(bool)

        entry_dates = [str(d.date()) if hasattr(d, 'date') else str(d) for d in df.index[entries]]
        exit_dates = [str(d.date()) if hasattr(d, 'date') else str(d) for d in df.index[exits]]

        # Build price series for chart
        prices = df["close"].tolist()
        dates = [str(d.date()) if hasattr(d, 'date') else str(d) for d in df.index]

        return jsonify({
            "status": "ok",
            "entry_count": int(entries.sum()),
            "exit_count": int(exits.sum()),
            "entry_dates": entry_dates,
            "exit_dates": exit_dates,
            "prices": prices,
            "dates": dates,
        }), 200

    except Exception as exc:
        logger.error(f"Preview error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Preview failed", "detail": str(exc)}), 500


@strategy_bp.route("/generate", methods=["POST"])
def generate_strategy():
    """Generate a strategy rule tree from a natural language prompt using Gemini."""
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()

    if not prompt:
        return jsonify({"status": "error", "message": "Prompt is required"}), 400

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"status": "error", "message": "GEMINI_API_KEY not configured in backend .env"}), 500

    system_prompt = """You are a trading strategy assistant. The user will describe a trading strategy in natural language.
Your job is to convert it into a JSON object with this exact structure:

{
  "name": "<short strategy name>",
  "entryLogic": {
    "id": "root_entry",
    "type": "GROUP",
    "logic": "AND",
    "conditions": [ ...conditions or nested groups... ]
  },
  "exitLogic": {
    "id": "root_exit",
    "type": "GROUP",
    "logic": "AND",
    "conditions": [ ...conditions or nested groups... ]
  }
}

A condition object looks like:
{
  "id": "unique_string",
  "indicator": "<IndicatorType>",
  "period": <number>,
  "operator": "<Operator>",
  "compareType": "STATIC" | "INDICATOR",
  "value": <number>,          // only when compareType is STATIC
  "rightIndicator": "<IndicatorType>",   // only when compareType is INDICATOR
  "rightPeriod": <number>                // only when compareType is INDICATOR
}

A nested group looks like:
{
  "id": "unique_string",
  "type": "GROUP",
  "logic": "AND" | "OR",
  "conditions": [ ...conditions or nested groups... ]
}

Valid IndicatorType values: "RSI", "SMA", "EMA", "MACD", "MACD Signal", "Bollinger Upper", "Bollinger Lower", "Bollinger Mid", "ATR", "Close Price", "Open Price", "High Price", "Low Price", "Volume"
Valid Operator values: "Crosses Above", "Crosses Below", ">", "<", "=", "Between"

Rules:
- Use only the valid values listed above, nothing else
- Always return valid JSON, no markdown code blocks, no explanation, just the JSON object
- Make logical entry AND exit conditions, do not leave either empty
- Use unique short ids like "c1", "c2", "g1" etc.
- "Between" operator is for range checks — use STATIC compareType with the lower bound as value (best to avoid it and use two separate conditions instead)
- If the user mentions a crossover, use "Crosses Above" or "Crosses Below"
"""

    try:
        import urllib.request as urlreq

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": system_prompt + "\n\nUser request: " + prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 1024,
            }
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        req = urlreq.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urlreq.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        # Extract text from Gemini response (null-safe — Gemini may return error with no candidates)
        candidates = result.get("candidates", [])
        if not candidates:
            api_error = result.get("error", {}).get("message", "Empty response from Gemini")
            raise ValueError(f"Gemini API error: {api_error}")
        text = (candidates[0].get("content", {}).get("parts", [{}])[0].get("text") or "").strip()

        # Strip markdown code fences if Gemini adds them
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

        strategy_json = json.loads(text)

        # Basic validation
        if "entryLogic" not in strategy_json or "exitLogic" not in strategy_json:
            raise ValueError("Missing entryLogic or exitLogic in response")

        return jsonify({
            "status": "ok",
            "name": strategy_json.get("name", "AI Strategy"),
            "entryLogic": strategy_json["entryLogic"],
            "exitLogic": strategy_json["exitLogic"],
        }), 200

    except json.JSONDecodeError as exc:
        logger.error(f"Gemini returned invalid JSON: {exc}")
        return jsonify({"status": "error", "message": "AI returned invalid JSON — try rephrasing your prompt"}), 500
    except Exception as exc:
        logger.error(f"Gemini generation error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": f"Generation failed: {str(exc)}"}), 500
