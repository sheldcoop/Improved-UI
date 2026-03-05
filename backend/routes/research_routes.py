"""Research routes — Quant Research Lab API.

Blueprint: ``research_bp`` mounted at ``/api/v1/research``.

Endpoints:
    POST /analyze — Run full statistical analysis on a stock.
"""

from __future__ import annotations

import logging
from typing import Any

from flask import Blueprint, request, jsonify

from services.data_fetcher import DataFetcher
from services.research.research_engine import analyze

logger = logging.getLogger(__name__)

research_bp = Blueprint("research", __name__)


@research_bp.route("/analyze", methods=["POST"])
def run_analysis() -> tuple[Any, int]:
    """Run quant research analysis on a stock.

    Expects JSON body:
        symbol (str): Ticker symbol, e.g. 'RELIANCE'.
        startDate (str): 'YYYY-MM-DD'.
        endDate (str): 'YYYY-MM-DD'.
        timeframe (str): '1d' (default).

    Returns:
        JSON with ``profile``, ``seasonality``, ``distribution`` keys.

    Raises:
        400: If symbol is missing or data cannot be fetched.
        500: On unexpected internal errors.
    """
    try:
        body = request.get_json(silent=True) or {}
        symbol = body.get("symbol", "").strip()
        start_date = body.get("startDate")
        end_date = body.get("endDate")
        timeframe = body.get("timeframe", "1d")

        # ── Input validation ───────────────────────────────────────────
        if not symbol:
            return jsonify({"status": "error", "message": "symbol is required"}), 400

        # ── Fetch stock data ───────────────────────────────────────────
        fetcher = DataFetcher()
        df = fetcher.fetch_historical_data(
            symbol=symbol,
            timeframe=timeframe,
            from_date=start_date,
            to_date=end_date,
        )

        if df is None or df.empty:
            return jsonify({
                "status": "error",
                "message": f"No data available for {symbol}. Load data first via Market Data.",
            }), 400

        # ── Fetch NIFTY 50 benchmark ───────────────────────────────────
        benchmark_df = None
        try:
            benchmark_df = fetcher.fetch_historical_data(
                symbol="NIFTY 50",
                timeframe=timeframe,
                from_date=start_date,
                to_date=end_date,
            )
        except Exception as e:
            logger.warning(f"Benchmark (NIFTY 50) fetch failed — beta will be None: {e}")

        # ── Fetch correlation symbols (optional) ──────────────────────
        correlation_symbols = body.get("correlationSymbols", [])
        correlation_dfs: dict[str, any] = {}
        for corr_sym in correlation_symbols:
            corr_sym = corr_sym.strip().upper()
            if not corr_sym or corr_sym == symbol.upper():
                continue
            try:
                corr_df = fetcher.fetch_historical_data(
                    symbol=corr_sym,
                    timeframe=timeframe,
                    from_date=start_date,
                    to_date=end_date,
                )
                if corr_df is not None and not corr_df.empty:
                    correlation_dfs[corr_sym] = corr_df
            except Exception as e:
                logger.warning(f"Correlation symbol {corr_sym} fetch failed: {e}")

        # ── Run analysis ───────────────────────────────────────────────
        logger.info(f"🔬 Running research analysis on {symbol} ({len(df)} bars)")
        result = analyze(df, benchmark_df=benchmark_df, correlation_dfs=correlation_dfs)

        return jsonify({
            "status": "success",
            "symbol": symbol,
            "startDate": start_date,
            "endDate": end_date,
            "timeframe": timeframe,
            "bars": len(df),
            **result,
        }), 200

    except ValueError as e:
        logger.error(f"Research analysis validation error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        logger.critical(f"Research analysis unexpected error: {e}", exc_info=True)
        return jsonify({"status": "error", "message": "Internal server error"}), 500
