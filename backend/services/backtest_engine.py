"""Backtesting service — replaces BacktestEngine from engine.py.

Runs vectorbt portfolio simulations from entry/exit signals.
Fixes:
  - Mutable default argument config={} (Issue #6)
  - Hardcoded startDate/endDate in response (Issue #15)
  - Missing type hints (Issue #4)
  - Missing docstrings (Issue #5)
"""
from __future__ import annotations


import logging
import math
from utils.json_utils import clean_float_values
import numpy as np
import pandas as pd
import vectorbt as vbt

from strategies import StrategyFactory
from utils.alert_manager import AlertManager
from services.portfolio_utils import boolify, detect_freq
from services.stats_serializer import serialize_vbt_stats
from services.trade_formatter import format_trade_records

logger = logging.getLogger(__name__)

DEFAULT_CAPITAL = 100000.0
DEFAULT_COMMISSION = 20.0
DEFAULT_SLIPPAGE = 0.0


class BacktestEngine:
    """Runs vectorised backtests using VectorBT Portfolio.from_signals.

    All methods are static — no instance state is needed.
    """

    @staticmethod
    def run(
        df: pd.DataFrame | None,
        strategy_id: str,
        config: dict | None = None,
    ) -> dict | None:
        """Execute a backtest and return structured results.

        Args:
            df: OHLCV DataFrame (single asset). Must not be None or empty.
            strategy_id: Strategy identifier string (e.g. '1', '3', or UUID).
            config: Backtest configuration dict. Supported keys:
                - slippage (float): Slippage % per trade. Default 0.
                - commission (float): Fixed commission per trade. Default 20.
                - initial_capital (float): Starting capital. Default 100000.
                - stopLossPct (float): Stop-loss %. 0 = disabled.
                - takeProfitPct (float): Take-profit %. 0 = disabled.
                - useTrailingStop (bool): Enable trailing stop. Default False.
                - pyramiding (int): Max concurrent entries. Default 1.
                - positionSizing (str): Sizing mode. Default 'Fixed Capital'.
                - positionSizeValue (float): Size value. Default 100000.

        Returns:
            Dict with keys: metrics, equityCurve, trades, monthlyReturns,
            startDate, endDate. Returns None if df is empty or VBT fails.

        Raises:
            No exceptions are raised — all errors are logged and None returned.

        Example:
            >>> engine = BacktestEngine()
            >>> result = BacktestEngine.run(df, '3', {'fast': 10, 'slow': 50})
            >>> print(result['metrics']['totalReturnPct'])
            12.5
        """
        # Fix Issue #6: mutable default argument
        if config is None:
            config = {}

        if df is None or df.empty:
            logger.warning("Empty dataframe provided to BacktestEngine")
            return {"status": "failed", "error": "No data found for the selected period."}

        # Guard against input mutation
        df = df.copy()

        # --- 1. CONFIGURATION ---
        slippage = float(config.get("slippage", DEFAULT_SLIPPAGE)) / 100.0
        initial_capital = float(config.get("initial_capital", DEFAULT_CAPITAL))
        # Commission is a flat amount per trade (e.g. ₹20).
        # Use fixed_fees so VectorBT deducts exactly ₹20 per order,
        # matching the reference Colab script and portfolio_utils.build_portfolio.
        commission_fixed = float(config.get("commission", DEFAULT_COMMISSION))
        sl_pct = float(config.get("stopLossPct", 0)) / 100.0
        tp_pct = float(config.get("takeProfitPct", 0)) / 100.0
        use_trailing = bool(config.get("useTrailingStop", False))
        pyramiding = int(config.get("pyramiding", 1))
        accumulate = pyramiding > 1

        # Normalize columns to Title Case before signal generation so strategies
        # can reliably access df['close'], df['open'], etc.
        df.columns = [c.lower() for c in df.columns]

        # --- 2. GENERATE SIGNALS ---
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits, *_w = strategy.generate_signals(df)
        exec_warnings: list = list(_w[0]) if _w and _w[0] else []

        # --- SANITISE SIGNALS (fix numba failures when dtype==object) ---
        entries = boolify(entries)
        exits = boolify(exits)

        close_price = df["close"]
        
        # Diagnostic logging for data range and signal counts
        logger.info(f"BacktestEngine Execution: strategy_id={strategy_id}, bars={len(df)}, range={df.index.min()} to {df.index.max()}")
        logger.info(f"Signals Generated: {entries.sum()} entries, {exits.sum()} exits")

        # --- 3. FREQUENCY DETECTION ---
        vbt_freq = detect_freq(df)

        # --- 4. POSITION SIZING ---
        sizing_mode = config.get("positionSizing", "Fixed Capital")
        size = float(config.get("positionSizeValue", 100000))
        size_type = "percent" if sizing_mode == "% of Equity" else "value"
        if size_type == "percent":
            size = size / 100.0

        # --- 5. EXECUTION ---
        pf_kwargs: dict = {
            "init_cash": initial_capital,
            "fees": 0.0,
            "fixed_fees": commission_fixed,
            "slippage": slippage,
            "freq": vbt_freq,
            "size": size,
            "size_type": size_type,
            "accumulate": accumulate,
        }
        # Apply stop-loss, take-profit, and trailing stop when configured
        if sl_pct > 0:
            pf_kwargs["sl_stop"] = sl_pct
        if tp_pct > 0:
            pf_kwargs["tp_stop"] = tp_pct
        if use_trailing and sl_pct > 0:
            pf_kwargs["sl_trail"] = True
        try:
            pf = vbt.Portfolio.from_signals(close_price, entries, exits, **pf_kwargs)
            results = BacktestEngine._extract_results(pf, df, config)

            if exec_warnings:
                for warn in exec_warnings:
                    results["metrics"]["alerts"].append({
                        "type": "warning",
                        "msg": f"Python Strategy Warning: {warn}"
                    })

            return results
        except Exception as exc:
            logger.error(f"VBT Execution Error: {exc}", exc_info=True)
            return {"status": "failed", "error": str(exc), "metrics": {}, "trades": []}



    @staticmethod
    def _extract_results(
        pf: vbt.Portfolio,
        df: pd.DataFrame,
        config: dict | None = None,
        vbt_freq: str = "1D",
    ) -> dict:
        """Extract structured results from a VectorBT Portfolio (single-asset).

        Args:
            pf: Completed VectorBT Portfolio instance.
            df: Original OHLCV DataFrame (used for real start/end dates).
            config: Strategy config dict.
            vbt_freq: VectorBT frequency string.

        Returns:
            Dict with keys: metrics, equityCurve, trades, monthlyReturns,
            startDate, endDate, pfStats, advancedStats.
        """
        idx = df.index
        start_date = str(idx[0].date())  if len(idx) > 0 else "N/A"
        end_date   = str(idx[-1].date()) if len(idx) > 0 else "N/A"

        metrics = BacktestEngine._build_metrics(pf, df)

        # Equity curve + drawdown
        equity_curve, returns_series = BacktestEngine._build_equity_curve(pf)

        # Trades — vectorized (no iterrows)
        trades = format_trade_records(pf)

        # Monthly returns extracted down to a 1-line helper function
        monthly_returns_data = BacktestEngine._compute_monthly_returns(returns_series)

        # pfStats / advStats for the raw tabs
        try:
            stats = pf.stats()
            pf_stats_raw = stats.to_dict() if hasattr(stats, "to_dict") else dict(stats)
            pf_stats_result = clean_float_values(serialize_vbt_stats(pf_stats_raw))
        except Exception as e:
            logger.warning(f"Failed to serialize pf.stats(): {e}")
            pf_stats_result = {}

        try:
            ret_stats = pf.returns().vbt.returns.stats()
            ret_stats_raw = ret_stats.to_dict() if hasattr(ret_stats, "to_dict") else dict(ret_stats)
            adv_stats_result = clean_float_values(serialize_vbt_stats(ret_stats_raw))
        except Exception as e:
            logger.warning(f"Failed to serialize returns.stats(): {e}")
            adv_stats_result = {}

        results: dict = {
            "metrics":        metrics,
            "equityCurve":    equity_curve,
            "trades":         trades,
            "monthlyReturns": monthly_returns_data,
            "startDate":      start_date,
            "endDate":        end_date,
            "pfStats":        pf_stats_result,
            "advancedStats":  adv_stats_result,
            "returnsStats":   {},
        }
        if config is not None:
            results["statsParams"] = {"freq": config.get("statsFreq"), "window": config.get("statsWindow")}

        return results

    @staticmethod
    def _build_equity_curve(pf: vbt.Portfolio) -> tuple[list[dict], pd.Series]:
        """Build the equity curve payload and return the associated returns series."""
        equity       = pf.value()
        returns_series = pf.returns() if callable(pf.returns) else pf.returns
        dd_pct       = (pf.drawdown() if callable(pf.drawdown) else pf.drawdown) * 100
        equity_curve = [
            {"date": str(d), "value": round(v, 2), "drawdown": round(abs(dd_pct.loc[d]), 2)}
            for d, v in equity.items()
        ]
        return equity_curve, returns_series

    @staticmethod
    def _build_metrics(pf: vbt.Portfolio, df: pd.DataFrame) -> dict:
        """Extract all headline metrics, applying JSON sanitisation exclusively locally."""
        stats = pf.stats()
        pf_stats_raw = stats.to_dict() if hasattr(stats, "to_dict") else dict(stats)

        try:
            dt_stats = pf.drawdowns.stats()
            avg_dd_dur = dt_stats.get("Avg Drawdown Duration", 0)
            avg_dd_duration = f"{avg_dd_dur.days}d" if hasattr(avg_dd_dur, "days") else f"{int(avg_dd_dur)}d"
        except Exception:
            avg_dd_duration = "0d"

        try:
            tr_stats = pf.trades.stats()
            expectancy = round(float(tr_stats.get("Expectancy", 0)), 2)
            max_consec = int(tr_stats.get("Max Loss Streak", 0))
        except Exception:
            expectancy = 0.0
            max_consec = 0

        total_return_pct = round(pf.total_return() * 100, 2)
        
        # Robust CAGR computation (Bypassing VectorBT's freq-dependent internal logic)
        try:
            days = (df.index[-1] - df.index[0]).days
            if days > 0:
                years = days / 365.25
                cagr_val = (((1 + (total_return_pct / 100)) ** (1 / years)) - 1) * 100
                cagr = round(cagr_val, 2)
            else:
                cagr = 0.0
        except Exception:
            cagr = round(float(pf_stats_raw.get("Ann. Return [%]", 0)), 2)

        # Compute max drawdown once so Calmar can reuse it.
        # VBT's built-in Calmar mixes units (divides % return by decimal drawdown),
        # producing values like 422 instead of ~8. We compute it correctly here:
        # Calmar = CAGR (%) / Max Drawdown (%) — both in the same unit.
        max_dd_pct = round(abs(float(pf_stats_raw.get("Max Drawdown [%]", 0))), 2)
        calmar = round(cagr / max_dd_pct, 2) if max_dd_pct > 0 else 0.0

        metrics = {
            "totalReturnPct": total_return_pct,
            "sharpeRatio":    round(float(pf_stats_raw.get("Sharpe Ratio", 0)), 2),
            "maxDrawdownPct": max_dd_pct,
            "winRate":        round(float(pf_stats_raw.get("Win Rate [%]", 0)), 1),
            "profitFactor":   round(float(pf_stats_raw.get("Profit Factor", 0)), 2),
            "totalTrades":    int(pf_stats_raw.get("Total Trades", 0)),
            "omegaRatio":     round(float(pf_stats_raw.get("Omega Ratio", 0)), 2),
            "volatility":     round(float(pf_stats_raw.get("Volatility (Ann.) [%]", 0)), 1),
            "cagr":           cagr,
            "sortinoRatio":   round(float(pf_stats_raw.get("Sortino Ratio", 0)), 2),
            "calmarRatio":    calmar,
            "expectancy":     expectancy,
            "consecutiveLosses": max_consec,
            "avgDrawdownDuration": avg_dd_duration,
            "status": "completed",
        }
        clean_metrics = clean_float_values(metrics)
        alerts: list[dict] = AlertManager.analyze_backtest({"metrics": clean_metrics}, df)

        # Inject 0-trade explanation if applicable
        if clean_metrics.get("totalTrades", 0) == 0:
            alerts.insert(0, {
                "type": "warning", 
                "msg": "0 trades executed. Check if your entry logic is reversed, or if indicator conditions ever converged."
            })
            
        clean_metrics["alerts"] = alerts
        return clean_metrics

    @staticmethod
    def _compute_monthly_returns(returns_series: pd.Series) -> list[dict]:
        """Aggregate daily returns into cleanly formatted monthly returns."""
        data = []
        try:
            try:
                monthly_resampled = returns_series.resample("ME").apply(lambda x: (1 + x).prod() - 1)
            except ValueError:
                # Fallback for pandas < 2.2.0
                monthly_resampled = returns_series.resample("M").apply(lambda x: (1 + x).prod() - 1)
                
            for date, ret in monthly_resampled.items():
                data.append({
                    "year": date.year,
                    "month": date.month - 1,  # JS 0-indexed months
                    "returnPct": round(ret * 100, 2),
                })
        except Exception as exc:
            logger.warning(f"Failed to calculate monthly returns: {exc}")
        return data


