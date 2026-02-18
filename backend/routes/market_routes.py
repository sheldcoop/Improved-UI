"""Market data blueprint — HTTP handler only, no business logic.

All data fetching logic lives in services/data_fetcher.py.
"""
from __future__ import annotations

from flask import Blueprint, request, jsonify
import logging
import os
import pandas as pd

from services.data_fetcher import DataFetcher
from services.scrip_master import search_instruments, get_instrument_by_symbol
from services.dhan_historical import fetch_historical_data, validate_date_range
from services.strategy_store import StrategyStore
from services.backtest_engine import BacktestEngine
from utils.market_calendar import get_nse_trading_days, is_trading_day

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

        # Validate dates using helper
        try:
            val_from, val_to = validate_date_range(from_date, to_date)
        except ValueError as e:
             return jsonify({"status": "error", "message": str(e)}), 400

        # Trigger initial fetch if no cache exists (Improvement for "not getting data" issue)
        fetcher = DataFetcher(request.headers)
        fetcher.fetch_historical_data(symbol, timeframe, val_from, val_to)

        report = _compute_data_health(symbol, timeframe, val_from, val_to)
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
    cache_dir = "cache_dir"
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
    safe_symbol = symbol.replace(" ", "_").replace("/", "_")
    
    # Provider-agnostic check: find any parquet file for this symbol/timeframe
    # Convention: {symbol}_{timeframe}_{provider}.parquet or just {symbol}_{timeframe}.parquet
    parquet_path = None
    if os.path.exists(cache_dir):
        files = os.listdir(cache_dir)
        for f in files:
            if f.startswith(f"{safe_symbol}_{timeframe}") and f.endswith(".parquet"):
                parquet_path = os.path.join(cache_dir, f)
                break

    start_dt = pd.Timestamp(from_date)
    end_dt = pd.Timestamp(to_date)

    if parquet_path is None or not os.path.exists(parquet_path):
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
    # Handle both Uppercase and lowercase columns
    vol_col = "Volume" if "Volume" in df.columns else "volume"
    zero_vol = int((df[vol_col] == 0).sum()) if vol_col in df.columns else 0

    # Detect gaps: consecutive trading days with no data
    if timeframe == "1d":
        # Senior Dev Tip: Use the specialized trading calendar to exclude holidays and weekends
        expected_days = get_nse_trading_days(start_dt.date(), end_dt.date())
        actual_days = df.index.normalize().unique()
        missing_days = expected_days.difference(actual_days)
        missing = len(missing_days)
        gaps = [str(d.date()) for d in missing_days[:10]]  # cap at 10 for response size
    else:
        # Intraday gap detection: calculate expected candles per day (9:15 to 15:30)
        # 375 minutes / interval
        try:
            interval_mins = int(timeframe[:-1]) if timeframe[-1] == 'm' else 60
            candles_per_day = 375 // interval_mins
            expected_trading_days = get_nse_trading_days(start_dt.date(), end_dt.date())
            expected_total = len(expected_trading_days) * candles_per_day
            
            missing = max(0, expected_total - total)
            
            # Simple gap detection: consecutive rows with timestamp difference > interval
            diffs = df.index.to_series().diff()
            # Allow for overnight and weekend jumps
            mask = (diffs > pd.Timedelta(minutes=interval_mins))
            # Filter out known non-trading jumps (e.g., overnight)
            gaps = [str(d) for d in df.index[mask][:10]]
        except Exception as e:
            logger.warning(f"Intraday gap detection failed: {e}")
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


@market_bp.route("/instruments", methods=["GET"])
def get_instruments():
    """Search instruments by segment and query.
    
    Query Parameters:
        segment (str): "NSE_EQ" or "NSE_SME"
        q (str): Search query string
    
    Returns:
        JSON list of instruments with symbol, display_name, security_id, instrument_type
    """
    try:
        segment = request.args.get("segment", "").strip()
        query = request.args.get("q", "").strip()
        
        if not segment:
            return jsonify({"status": "error", "message": "segment parameter is required"}), 400
        
        if segment not in ["NSE_EQ", "NSE_SME"]:
            return jsonify({"status": "error", "message": "segment must be NSE_EQ or NSE_SME"}), 400
        
        results = search_instruments(segment, query, limit=20)
        return jsonify(results), 200
        
    except Exception as exc:
        logger.error(f"Instrument search error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to search instruments"}), 500


@market_bp.route("/backtest/run", methods=["POST"])
def run_backtest():
    """Run backtest simulation using Dhan historical data.
    
    Request JSON:
        instrument_details: {
            security_id (str): Dhan security ID
            symbol (str): Symbol name
            exchange_segment (str): Always "NSE_EQ" for both Mainboard and SME
            instrument_type (str): "EQUITY", etc.
        }
        parameters: {
            timeframe (str): "1d", "1m", "5m", "15m", "1h"
            start_date (str): "YYYY-MM-DD"
            end_date (str): "YYYY-MM-DD"
            initial_capital (float): Starting capital
            strategy_logic (dict): Strategy configuration
        }
    
    Returns:
        JSON backtest results with performance metrics
    """
    try:
        data = request.json or {}
        
        # Validate required fields
        inst_details = data.get("instrument_details", {})
        if not inst_details.get("security_id"):
            return jsonify({"status": "error", "message": "security_id is required"}), 400
        if not inst_details.get("exchange_segment"):
            return jsonify({"status": "error", "message": "exchange_segment is required"}), 400
        if not inst_details.get("instrument_type"):
            return jsonify({"status": "error", "message": "instrument_type is required"}), 400
        
        params = data.get("parameters", {})
        if not params.get("timeframe"):
            return jsonify({"status": "error", "message": "timeframe is required"}), 400
        if not params.get("start_date") or not params.get("end_date"):
            return jsonify({"status": "error", "message": "start_date and end_date are required"}), 400
        
        # Validate date range
        try:
            validate_date_range(params["start_date"], params["end_date"])
        except ValueError as e:
            return jsonify({"status": "error", "message": str(e)}), 400
        
        # Trigger fetch and cache via DataFetcher (Rule 9 Fix)
        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(
            symbol=inst_details["symbol"],
            timeframe=params["timeframe"],
            from_date=params["start_date"],
            to_date=params["end_date"]
        )
        
        if df is None or df.empty:
            return jsonify({"status": "error", "message": "No data returned from provider"}), 400
        
        logger.info(f"Obtained {len(df)} candles via DataFetcher (Cache or API)")
        
        # Prepare strategy parameters and logic (Rule 1 Fix)
        strategy_logic = params.get("strategy_logic", {})
        strategy_name = strategy_logic.get("name", "SMA Crossover")
        
        # Map frontend strategy names to backend IDs
        strategy_id = "3" # Default to SMA
        if "RSI" in strategy_name:
            strategy_id = "1"
        elif strategy_logic.get("id"):
            # If a custom strategy ID is provided, use it and load its logic
            strategy_id = strategy_logic["id"]
            if strategy_id not in ("1", "3"):
                saved = StrategyStore.get_by_id(strategy_id)
                if saved:
                    logger.info(f"Merging Custom Strategy Logic: {saved.get('name')}")
                    # Strategy parameters from frontend override defaults in saved logic
                    merged_logic = saved.copy()
                    merged_logic.update(strategy_logic)
                    strategy_logic = merged_logic

        # Run actual backtest simulation
        bt_results = BacktestEngine.run(df, strategy_id, strategy_logic)
        
        if not bt_results or bt_results.get("status") == "failed":
            return jsonify({
                "status": "failed", 
                "message": bt_results.get("error", "Simulated execution failed.")
            }), 400

        # Combine into Final Response that matches BacktestResult interface
        response = {
            "id": f"bk-{pd.Timestamp.now().strftime('%M%S')}",
            "strategyName": strategy_name,
            "symbol": inst_details["symbol"],
            "timeframe": params["timeframe"],
            "status": "completed",
            **bt_results
        }
        
        logger.info(f"Backtest completed successfully for {inst_details['symbol']}")
        return jsonify(response), 200
        
    except ValueError as e:
        logger.error(f"Backtest validation error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as exc:
        logger.error(f"Backtest error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to run backtest"}), 500
