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

        # Minimum bars check — strategies with large indicator periods need enough
        # bars to warm up AND have tradeable bars afterward. Require at least 50 bars.
        MIN_BARS = 50
        if len(df) < MIN_BARS:
            return {
                "status": "failed",
                "error": f"Insufficient data: only {len(df)} bars available. At least {MIN_BARS} bars are required for reliable backtesting."
            }

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
        open_price  = df["open"]
        high_price  = df["high"]
        low_price   = df["low"]
        
        # Eliminate Look-Ahead Bias: if signals shifted for next bar, we must execute at Open, not Close.
        execute_price = open_price if config.get("nextBarEntry", True) else close_price

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
            # upon_stop_exit: "close" (default) checks stop against bar close only.
            # "next_open" exits at the next bar's open — more realistic for daily data.
            # "stop" exits at the stop price (intrabar simulation using high/low).
            # We use "stop" so that a breach of the SL/TP level within a candle
            # (detectable via high/low) triggers exit at the stop price, not close.
            pf_kwargs["upon_stop_exit"] = "stop"
        if tp_pct > 0:
            pf_kwargs["tp_stop"] = tp_pct
            pf_kwargs["upon_stop_exit"] = "stop"
        if use_trailing:
            if sl_pct > 0:
                pf_kwargs["sl_trail"] = True
            else:
                logger.warning(
                    "useTrailingStop=True but stopLossPct=0 — trailing stop requires a non-zero "
                    "stopLossPct to anchor the initial stop. TSL will NOT be applied."
                )
        try:
            pf = vbt.Portfolio.from_signals(
                close=close_price,
                entries=entries,
                exits=exits,
                price=execute_price,
                high=high_price,
                low=low_price,
                open=open_price,
                **pf_kwargs
            )
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
        monthly_returns_data, monthly_err = BacktestEngine._compute_monthly_returns(returns_series)
        if monthly_err:
            metrics["alerts"].append({"type": "warning", "msg": monthly_err})

        # Rolling performance metrics (63-bar ≈ 3 months of trading days)
        rolling_metrics = BacktestEngine._compute_rolling_metrics(returns_series)

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
            "rollingMetrics": rolling_metrics,
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
        equity         = pf.value()
        returns_series = pf.returns() if callable(pf.returns) else pf.returns
        dd_pct         = (pf.drawdown() if callable(pf.drawdown) else pf.drawdown) * 100
        equity_curve   = []
        for d, v in equity.items():
            try:
                dd_val = round(abs(dd_pct.loc[d]), 2)
            except KeyError:
                logger.debug(f"Drawdown index miss for date {d} — using 0.0")
                dd_val = 0.0
            equity_curve.append({"date": str(d), "value": round(v, 2), "drawdown": dd_val})
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
        except Exception as exc:
            logger.warning(f"Could not compute avg drawdown duration (defaulting to 0d): {exc}")
            avg_dd_duration = "0d"

        try:
            tr_stats = pf.trades.stats()
            expectancy = round(float(tr_stats.get("Expectancy", 0)), 2)
            max_consec = int(tr_stats.get("Max Loss Streak", 0))
        except Exception as exc:
            logger.warning(f"Could not compute trade stats (expectancy/max_consec defaulting to 0): {exc}")
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

        def _safe_float(val: object, default: float = 0.0, name: str = "") -> float:
            """Convert a VBT stat value (may be Series) to a plain Python float."""
            try:
                if hasattr(val, "iloc"):  # pd.Series from universe portfolios
                    val = val.iloc[0]
                return float(val) if val is not None else default
            except Exception as exc:
                if name:
                    logger.warning(f"Metric '{name}' could not be parsed (defaulting to {default}): {exc}")
                return default

        metrics = {
            "totalReturnPct": round(_safe_float(total_return_pct, name="totalReturnPct"), 2),
            "sharpeRatio":    round(_safe_float(pf_stats_raw.get("Sharpe Ratio"), name="sharpeRatio"), 2),
            "maxDrawdownPct": round(abs(_safe_float(pf_stats_raw.get("Max Drawdown [%]"), name="maxDrawdownPct")), 2),
            "winRate":        round(_safe_float(pf_stats_raw.get("Win Rate [%]"), name="winRate"), 1),
            "profitFactor":   round(_safe_float(pf_stats_raw.get("Profit Factor"), name="profitFactor"), 2),
            "totalTrades":    int(_safe_float(pf_stats_raw.get("Total Trades"), name="totalTrades")),
            "omegaRatio":     round(_safe_float(pf_stats_raw.get("Omega Ratio"), name="omegaRatio"), 2),
            "volatility":     round(_safe_float(pf_stats_raw.get("Volatility (Ann.) [%]"), name="volatility"), 1),
            "cagr":           cagr,
            "sortinoRatio":   round(_safe_float(pf_stats_raw.get("Sortino Ratio"), name="sortinoRatio"), 2),
            "calmarRatio":    calmar,
            "expectancy":     expectancy,
            "consecutiveLosses": max_consec,
            "avgDrawdownDuration": avg_dd_duration,
            "status": "completed",
        }
        clean_metrics = clean_float_values(metrics)
        alerts: list[dict] = AlertManager.analyze_backtest({"metrics": clean_metrics}, df)

        # Inject 0-trade explanation with signal counts if applicable
        if clean_metrics.get("totalTrades", 0) == 0:
            try:
                entry_count = int(pf.orders.count())
            except Exception:
                entry_count = -1
            if entry_count == 0:
                zero_msg = (
                    "0 trades executed. Possible causes: "
                    "(1) entry conditions never fired — check your indicator thresholds; "
                    "(2) exit fires on the same bar as entry — conditions cancel each other; "
                    "(3) all signals were inside the warmup period — use more historical data."
                )
            else:
                zero_msg = (
                    f"0 completed trades despite {entry_count} order attempts. "
                    "Positions may have been opened but never closed — add exit conditions "
                    "or a Stop Loss to ensure positions are closed."
                )
            alerts.insert(0, {"type": "warning", "msg": zero_msg})
            
        clean_metrics["alerts"] = alerts
        return clean_metrics

    @staticmethod
    def _compute_monthly_returns(returns_series: pd.Series) -> tuple[list[dict], str | None]:
        """Aggregate daily returns into cleanly formatted monthly returns.

        Returns:
            Tuple of (monthly_data, error_message_or_None).
            error_message is set when computation fails so the caller can
            surface a diagnostic alert to the user instead of silently
            returning an empty list.
        """
        data: list[dict] = []
        error_msg: str | None = None
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
            error_msg = f"Monthly returns could not be computed: {exc}"
            logger.warning(error_msg)
        return data, error_msg

    @staticmethod
    def _compute_rolling_metrics(returns_series: pd.Series, window: int = 63) -> list[dict]:
        """Compute rolling return and Sharpe over a trailing ``window``-bar window.

        Args:
            returns_series: Daily/bar-level return Series from VBT.
            window: Rolling window size (default 63 ≈ 3 months of trading days).

        Returns:
            List of dicts with keys: date, returnPct, sharpe.
            Only entries where both metrics are non-NaN are included.
        """
        data: list[dict] = []
        try:
            if returns_series is None or returns_series.empty or len(returns_series) < window:
                return data

            # Rolling compound return: (1 + r1) * (1 + r2) * ... - 1
            rolling_ret = (1 + returns_series).rolling(window).apply(lambda x: x.prod() - 1, raw=True)

            # Rolling Sharpe: annualised (252 trading days assumed)
            rolling_mean = returns_series.rolling(window).mean()
            rolling_std = returns_series.rolling(window).std()
            rolling_sharpe = (rolling_mean / rolling_std) * math.sqrt(252)

            for date, ret_val in rolling_ret.items():
                sharpe_val = rolling_sharpe.get(date, float("nan"))
                if math.isnan(ret_val) or math.isnan(sharpe_val):
                    continue
                if not math.isfinite(ret_val) or not math.isfinite(sharpe_val):
                    continue
                data.append({
                    "date": str(date)[:10],  # YYYY-MM-DD
                    "returnPct": round(ret_val * 100, 2),
                    "sharpe": round(float(sharpe_val), 2),
                })
        except Exception as exc:
            logger.warning(f"Rolling metrics computation failed: {exc}")
        return data

    @staticmethod
    def _compute_advanced_metrics(
        pf: "vbt.Portfolio",
    ) -> dict:
        """Compute quant-grade advanced metrics from a VectorBT Portfolio.

        Called by tests and also by _build_metrics internally. Handles empty
        trade lists safely and supports both single-asset and universe mode.

        Args:
            pf: VectorBT Portfolio instance.

        Returns:
            Dict with keys: expectancy, kellyCriterion, consecutiveLosses,
            avgDrawdownDuration.
        """
        trades_df: pd.DataFrame = pf.trades.records_readable
        pnl: pd.Series = (
            trades_df["PnL"] if "PnL" in trades_df.columns
            else pd.Series([], dtype=float)
        )

        if pnl.empty:
            return {
                "expectancy": 0.0,
                "kellyCriterion": 0.0,
                "consecutiveLosses": 0,
                "avgDrawdownDuration": "0d",
            }

        wins   = pnl[pnl > 0]
        losses = pnl[pnl <= 0]
        n      = len(pnl)

        win_rate  = len(wins)  / n
        loss_rate = len(losses) / n
        avg_win   = float(wins.mean())   if len(wins)   > 0 else 0.0
        avg_loss  = float(losses.mean()) if len(losses) > 0 else 0.0

        expectancy = round(win_rate * avg_win + loss_rate * avg_loss, 2)

        # Kelly: f* = W/|avg_loss| - (1-W)/avg_win  (clamped to [0, 100])
        if avg_loss != 0 and avg_win > 0:
            kelly = win_rate / abs(avg_loss) - loss_rate / avg_win
            kelly = round(max(0.0, min(100.0, kelly * 100)), 2)
        else:
            kelly = 0.0

        # Consecutive losses — single linear pass
        max_streak = streak = 0
        for p in pnl:
            if p <= 0:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0

        # Average drawdown duration from VBT drawdown series
        try:
            dd_raw = pf.drawdown() if callable(pf.drawdown) else pf.drawdown
            dd_arr = getattr(dd_raw, "values", None)
            if dd_arr is not None:
                lengths: list[int] = []
                cur = 0
                for v in dd_arr:
                    if v < 0:
                        cur += 1
                    else:
                        if cur > 0:
                            lengths.append(cur)
                        cur = 0
                if cur > 0:
                    lengths.append(cur)
                avg_dur = int(round(sum(lengths) / len(lengths))) if lengths else 0
            else:
                avg_dur = 0
        except Exception:
            avg_dur = 0

        return {
            "expectancy":          expectancy,
            "kellyCriterion":      kelly,
            "consecutiveLosses":   max_streak,
            "avgDrawdownDuration": f"{avg_dur}d",
        }
