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
from services.data_health import DataHealthService
from utils.market_calendar import get_nse_trading_days, is_trading_day

market_bp = Blueprint("market", __name__)
logger = logging.getLogger(__name__)


@market_bp.route("/cache-status", methods=["GET"])
def get_cache_status():
    """Get metadata for all cached market data files."""
    try:
        fetcher = DataFetcher(request.headers)
        status = fetcher.get_cache_status()
        return jsonify(status), 200
    except Exception as exc:
        logger.error(f"Cache status error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to get cache status"}), 500


@market_bp.route("/fetch", methods=["POST"])
def fetch_data():
    """Trigger a data fetch and cache for a symbol."""
    try:
        data = request.json or {}
        symbol = data.get("symbol")
        timeframe = data.get("timeframe", "1d")
        from_date = data.get("from_date")
        to_date = data.get("to_date")

        if not symbol:
            return jsonify({"status": "error", "message": "symbol is required"}), 400

        fetcher = DataFetcher(request.headers)
        df = fetcher.fetch_historical_data(symbol, timeframe, from_date, to_date)
        
        if df is None or df.empty:
            return jsonify({"status": "error", "message": "Failed to fetch data"}), 404

        return jsonify({"status": "success", "rows": len(df)}), 200
    except Exception as exc:
        logger.error(f"Fetch data error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Fetch failed"}), 500


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

        report = DataHealthService.compute(symbol, timeframe, val_from, val_to)
        return jsonify(report), 200

    except Exception as exc:
        logger.error(f"Market validate error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Validation failed"}), 500


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
        bt_results = BacktestEngine.run(df, strategy_id, {**params, **strategy_logic})
        
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
