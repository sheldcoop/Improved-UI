from __future__ import annotations

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


def build_logic_summary(data: dict) -> str:
    """Build a plain-English summary of the strategy logic tree.

    Generates a human-readable description from the entryLogic / exitLogic
    rule trees, or from the Python Code mode.  The summary is generated
    server-side from the same tree that was evaluated, so it is always
    accurate regardless of what the frontend renders.

    Args:
        data: Request payload containing mode, entryLogic, exitLogic,
            and optionally pythonCode.

    Returns:
        Plain-English string describing the strategy entry and exit rules.
    """
    mode = data.get("mode", "VISUAL")

    if mode == "CODE":
        code = (data.get("pythonCode") or "").strip()
        fn_name = ""
        for line in code.splitlines():
            if line.startswith("def ") and "(" in line:
                fn_name = line.split("def ")[1].split("(")[0].strip()
                break
        return f"Python Code strategy — custom '{fn_name}' function."

    def describe_node(node: dict | None) -> str:
        if not node:
            return "(no conditions)"
        if node.get("type") == "GROUP":
            children = node.get("conditions", [])
            if not children:
                return "(empty group)"
            logic = node.get("logic", "AND")
            parts = [describe_node(c) for c in children]
            connector = f" {logic} "
            joined = connector.join(parts)
            return f"({joined})" if len(parts) > 1 else joined
        # Leaf condition
        ind = node.get("indicator", "?")
        period = node.get("period", "")
        tf = node.get("timeframe", "")
        tf_str = f"[{tf}]" if tf else ""
        period_str = f"({period})" if period and period != 0 else ""
        left = f"{ind}{tf_str}{period_str}"
        op = node.get("operator", "?")
        if node.get("compareType") == "INDICATOR":
            ri = node.get("rightIndicator", "?")
            rp = node.get("rightPeriod", "")
            rtf = node.get("rightTimeframe", "")
            rtf_str = f"[{rtf}]" if rtf else ""
            rp_str = f"({rp})" if rp else ""
            right = f"{ri}{rtf_str}{rp_str}"
        else:
            right = str(node.get("value", "?"))
        return f"{left} {op} {right}"

    entry = describe_node(data.get("entryLogic"))
    exit_ = describe_node(data.get("exitLogic"))
    return f"Buy when {entry}. Sell when {exit_}."


PRESET_STRATEGIES = [
    {
        "id": "1",
        "name": "RSI Mean Reversion",
        "description": "Buy when RSI is oversold, sell when overbought.",
        "params": [
            {"name": "period", "label": "RSI Period", "min": 5, "max": 30, "default": 14},
            {"name": "lower", "label": "Oversold Level", "min": 10, "max": 40, "default": 30},
            {"name": "upper", "label": "Overbought Level", "min": 60, "max": 90, "default": 70}
        ],
        "mode": "VISUAL",
        "entryLogic": {
            "id": "preset1_entry", "type": "GROUP", "logic": "AND",
            "conditions": [{"id": "p1e1", "indicator": "RSI", "period": 14, "operator": "Crosses Below", "compareType": "STATIC", "value": 30}]
        },
        "exitLogic": {
            "id": "preset1_exit", "type": "GROUP", "logic": "AND",
            "conditions": [{"id": "p1x1", "indicator": "RSI", "period": 14, "operator": "Crosses Above", "compareType": "STATIC", "value": 70}]
        }
    },
    {
        "id": "2",
        "name": "Bollinger Bands Mean Reversion",
        "description": "Buy below lower band, sell above middle band.",
        "params": [
            {"name": "period", "label": "Length", "min": 10, "max": 50, "default": 20},
            {"name": "std_dev", "label": "StdDev Multiplier", "min": 1.0, "max": 3.0, "default": 2.0, "step": 0.1}
        ],
        "mode": "CODE",
        "pythonCode": "def signal_logic(df):\n    # Bollinger Bands Mean Reversion\n    # vbt, pd, np, ta are available. config is a dict of preset params.\n    period = int(config.get(\"period\", 20))\n    std_dev = float(config.get(\"std_dev\", 2.0))\n    bb = vbt.BBANDS.run(df[\"close\"], window=period, alpha=std_dev)\n    entries = df[\"close\"].vbt.crossed_below(bb.lower)\n    exits = df[\"close\"].vbt.crossed_above(bb.middle)\n    return entries, exits"
    },
    {
        "id": "3",
        "name": "MACD Crossover",
        "description": "Buy when MACD line crosses above Signal line.",
        "params": [
            {"name": "fast", "label": "Fast Period", "min": 8, "max": 20, "default": 12},
            {"name": "slow", "label": "Slow Period", "min": 21, "max": 40, "default": 26},
            {"name": "signal", "label": "Signal Period", "min": 5, "max": 15, "default": 9}
        ],
        "mode": "CODE",
        "pythonCode": "def signal_logic(df):\n    # MACD Crossover\n    # vbt, pd, np, ta are available. config is a dict of preset params.\n    fast = int(config.get(\"fast\", 12))\n    slow = int(config.get(\"slow\", 26))\n    signal_w = int(config.get(\"signal\", 9))\n    macd = vbt.MACD.run(df[\"close\"], fast_window=fast, slow_window=slow, signal_window=signal_w)\n    entries = macd.macd.vbt.crossed_above(macd.signal)\n    exits = macd.macd.vbt.crossed_below(macd.signal)\n    return entries, exits"
    },
    {
        "id": "4",
        "name": "EMA Crossover",
        "description": "Trend following: Buy when Fast EMA crosses above Slow EMA.",
        "params": [
            {"name": "fast", "label": "Fast EMA", "min": 5, "max": 50, "default": 20},
            {"name": "slow", "label": "Slow EMA", "min": 51, "max": 200, "default": 50}
        ],
        "mode": "VISUAL",
        "entryLogic": {
            "id": "preset4_entry", "type": "GROUP", "logic": "AND",
            "conditions": [{"id": "p4e1", "indicator": "EMA", "period": 20, "operator": "Crosses Above", "compareType": "INDICATOR", "rightIndicator": "EMA", "rightPeriod": 50, "value": 0}]
        },
        "exitLogic": {
            "id": "preset4_exit", "type": "GROUP", "logic": "AND",
            "conditions": [{"id": "p4x1", "indicator": "EMA", "period": 20, "operator": "Crosses Below", "compareType": "INDICATOR", "rightIndicator": "EMA", "rightPeriod": 50, "value": 0}]
        }
    },
    {
        "id": "5",
        "name": "Supertrend",
        "description": "Trend following using canonical flip-based Supertrend (matches TradingView). Enter on bullish flip, exit on bearish flip.",
        "params": [
            {"name": "period", "label": "ATR Period", "min": 7, "max": 20, "default": 10},
            {"name": "multiplier", "label": "Multiplier", "min": 1.0, "max": 5.0, "default": 3.0, "step": 0.1}
        ],
        "mode": "CODE",
        "pythonCode": "def signal_logic(df):\n    # Supertrend (ATR-based trailing stop)\n    # vbt, pd, np, ta are available. config is a dict of preset params.\n    period = int(config.get(\"period\", 10))\n    mult = float(config.get(\"multiplier\", 3.0))\n    atr = vbt.ATR.run(df[\"high\"], df[\"low\"], df[\"close\"], window=period).atr\n    mid = df[\"close\"].ewm(span=period, adjust=False).mean()\n    upper = mid + mult * atr\n    lower = mid - mult * atr\n    entries = df[\"close\"].vbt.crossed_above(lower)\n    exits = df[\"close\"].vbt.crossed_below(upper)\n    return entries, exits"
    },
    {
        "id": "6",
        "name": "Stochastic RSI",
        "description": "Mean reversion using Stochastic of RSI.",
        "params": [
            {"name": "rsi_period", "label": "RSI Period", "min": 10, "max": 30, "default": 14},
            {"name": "k_period", "label": "K Period", "min": 3, "max": 10, "default": 3},
            {"name": "d_period", "label": "D Period", "min": 3, "max": 10, "default": 3}
        ],
        "mode": "CODE",
        "pythonCode": "def signal_logic(df):\n    # Stochastic RSI\n    # vbt, pd, np, ta are available. config is a dict of preset params.\n    rsi_period = int(config.get(\"rsi_period\", 14))\n    k = int(config.get(\"k_period\", 3))\n    d = int(config.get(\"d_period\", 3))\n    rsi = ta.momentum.rsi(df[\"close\"], window=rsi_period)\n    stoch_k = rsi.rolling(k).mean()\n    stoch_d = stoch_k.rolling(d).mean()\n    entries = ((stoch_k > stoch_d) & (stoch_k.shift(1) <= stoch_d.shift(1)) & (stoch_k < 80)).fillna(False)\n    exits = ((stoch_k < stoch_d) & (stoch_k.shift(1) >= stoch_d.shift(1)) & (stoch_k > 20)).fillna(False)\n    return entries, exits"
    },
    {
        "id": "7",
        "name": "ATR Channel Breakout",
        "description": "Volatility breakout: Buy above High + ATR*Mult.",
        "params": [
            {"name": "period", "label": "ATR Period", "min": 10, "max": 30, "default": 14},
            {"name": "multiplier", "label": "Distance Multiplier", "min": 1.0, "max": 4.0, "default": 2.0, "step": 0.1}
        ],
        "mode": "CODE",
        "pythonCode": "def signal_logic(df):\n    # ATR Channel Breakout\n    # vbt, pd, np, ta are available. config is a dict of preset params.\n    period = int(config.get(\"period\", 14))\n    mult = float(config.get(\"multiplier\", 2.0))\n    atr = vbt.ATR.run(df[\"high\"], df[\"low\"], df[\"close\"], window=period).atr\n    upper_band = df[\"high\"].rolling(period).max() + mult * atr\n    lower_band = df[\"low\"].rolling(period).min() - mult * atr\n    entries = df[\"close\"].vbt.crossed_above(upper_band.shift(1))\n    exits = df[\"close\"].vbt.crossed_below(lower_band.shift(1))\n    return entries, exits"
    }
]


@strategy_bp.route("", methods=["GET", "POST"])
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
    from_date = data.get("from_date") or None
    to_date = data.get("to_date") or None

    if not symbol or not isinstance(symbol, str) or len(symbol) > 30:
        return jsonify({"status": "error", "message": "Invalid symbol"}), 400
    if timeframe not in ("1m", "5m", "15m", "1h", "1d"):
        return jsonify({"status": "error", "message": "Invalid timeframe"}), 400

    try:
        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(symbol, timeframe, from_date, to_date)

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
        entries, exits, *_ = strategy.generate_signals(df)

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

        # Detect empty exit group — positions would stay open forever in backtest
        exit_logic = data.get("exitLogic") or {}
        empty_exit = len(exit_logic.get("conditions", [])) == 0

        # SL/TP settings are not applied in preview — signal a disclaimer to frontend
        sl_active = float(data.get("stopLossPct", 0)) > 0
        tp_active = float(data.get("takeProfitPct", 0)) > 0

        warnings = []
        if empty_exit:
            warnings.append("No exit conditions defined — positions will be held until end of data.")
        if sl_active or tp_active:
            warnings.append("SL/TP settings are not reflected in preview counts — they apply in the full backtest only.")

        return jsonify({
            "status": "ok",
            "entry_count": int(entries.sum()),
            "exit_count": int(exits.sum()),
            "entry_dates": entry_dates,
            "exit_dates": exit_dates,
            "prices": prices,
            "dates": dates,
            "warnings": warnings,
            "empty_exit": empty_exit,
            "sl_tp_ignored": sl_active or tp_active,
            "logic_summary": build_logic_summary(data),
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
Valid Operator values: "Crosses Above", "Crosses Below", ">", "<", "="

Rules:
- Use only the valid values listed above, nothing else
- Always return valid JSON, no markdown code blocks, no explanation, just the JSON object
- Make logical entry AND exit conditions, do not leave either empty
- Use unique short ids like "c1", "c2", "g1" etc.
- For range checks (e.g. RSI between 30 and 70), use two separate conditions combined with AND logic
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
