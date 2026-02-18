"""Market data blueprint — HTTP handler only, no business logic.

All data fetching logic lives in services/data_fetcher.py.
"""
from __future__ import annotations

from flask import Blueprint, request, jsonify
import logging
import os
import pandas as pd

from services.data_fetcher import DataFetcher

market_bp = Blueprint("market", __name__)
logger = logging.getLogger(__name__)


@market_bp.route("/option-chain", methods=["POST"])
def option_chain():
    """Fetch option chain data for a symbol and expiry.

    Request JSON keys:
        symbol (str): Underlying symbol (e.g. 'NIFTY 50'). Required.
        expiry (str): Expiry date in 'YYYY-MM-DD' format. Required.

    Returns:
        JSON list of option strike dicts. Currently returns [] until
        Dhan live API is integrated (see DhanHQ-py-main/ reference).
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol")
        expiry = data.get("expiry")

        if not symbol or not isinstance(symbol, str):
            return jsonify({"status": "error", "message": "symbol is required"}), 400
        if not expiry or not isinstance(expiry, str):
            return jsonify({"status": "error", "message": "expiry is required"}), 400

        fetcher = DataFetcher(request.headers)
        strikes = fetcher.fetch_option_chain(symbol, expiry)
        return jsonify(strikes), 200

    except Exception as exc:
        logger.error(f"Option chain error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to fetch option chain"}), 500


@market_bp.route("/validate", methods=["POST"])
def validate_market_data():
    """Validate cached market data quality for a symbol and date range.

    Inspects the Parquet cache file for the requested symbol/timeframe
    and returns a DataHealthReport with missing candles, zero-volume
    candles, detected gaps, and an overall quality score.

    Request JSON keys:
        symbol (str): Ticker symbol. Required.
        timeframe (str): Candle interval (e.g. '1d', '5m'). Default '1d'.
        from_date (str): Start date 'YYYY-MM-DD'. Required.
        to_date (str): End date 'YYYY-MM-DD'. Required.

    Returns:
        JSON DataHealthReport with keys: score, missingCandles,
        zeroVolumeCandles, totalCandles, gaps, status.
    """
    try:
        data = request.json or {}
        symbol = data.get("symbol")
        timeframe = data.get("timeframe", "1d")
        from_date = data.get("from_date")
        to_date = data.get("to_date")

        if not symbol:
            return jsonify({"status": "error", "message": "symbol is required"}), 400
        if not from_date or not to_date:
            return jsonify({"status": "error", "message": "from_date and to_date are required"}), 400

        report = _compute_data_health(symbol, timeframe, from_date, to_date)
        return jsonify(report), 200

    except Exception as exc:
        logger.error(f"Market validate error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Validation failed"}), 500


def _compute_data_health(
    symbol: str,
    timeframe: str,
    from_date: str,
    to_date: str,
) -> dict:
    """Compute a DataHealthReport by inspecting the Parquet cache.

    Args:
        symbol: Ticker symbol.
        timeframe: Candle interval string.
        from_date: Start date 'YYYY-MM-DD'.
        to_date: End date 'YYYY-MM-DD'.

    Returns:
        DataHealthReport dict with score, missingCandles, zeroVolumeCandles,
        totalCandles, gaps (list of date strings), and status string.
    """
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "cache_dir")
    safe_symbol = symbol.replace(" ", "_").replace("/", "_")
    parquet_path = os.path.join(cache_dir, f"{safe_symbol}_{timeframe}_alphavantage.parquet")

    start_dt = pd.Timestamp(from_date)
    end_dt = pd.Timestamp(to_date)

    if not os.path.exists(parquet_path):
        # No cache yet — return a neutral report
        return {
            "score": 0.0,
            "missingCandles": 0,
            "zeroVolumeCandles": 0,
            "totalCandles": 0,
            "gaps": [],
            "status": "CRITICAL",
            "note": "No cached data found. Run a backtest first to populate the cache.",
        }

    df = pd.read_parquet(parquet_path)
    df = df[(df.index >= start_dt) & (df.index <= end_dt)]

    total = len(df)
    if total == 0:
        return {
            "score": 0.0,
            "missingCandles": 0,
            "zeroVolumeCandles": 0,
            "totalCandles": 0,
            "gaps": [],
            "status": "CRITICAL",
            "note": "No data in the requested date range.",
        }

    # Zero-volume candles
    zero_vol = int((df["Volume"] == 0).sum()) if "Volume" in df.columns else 0

    # Detect gaps: consecutive trading days with no data
    if timeframe == "1d":
        expected_days = pd.bdate_range(start=start_dt, end=end_dt)
        actual_days = df.index.normalize().unique()
        missing_days = expected_days.difference(actual_days)
        missing = len(missing_days)
        gaps = [str(d.date()) for d in missing_days[:10]]  # cap at 10 for response size
    else:
        missing = 0
        gaps = []

    raw_score = 100 - (missing * 2) - (zero_vol * 1)
    score = round(max(0.0, min(100.0, raw_score)), 1)

    if score >= 98:
        status = "EXCELLENT"
    elif score >= 85:
        status = "GOOD"
    elif score >= 60:
        status = "POOR"
    else:
        status = "CRITICAL"

    return {
        "score": score,
        "missingCandles": missing,
        "zeroVolumeCandles": zero_vol,
        "totalCandles": total,
        "gaps": gaps,
        "status": status,
    }
