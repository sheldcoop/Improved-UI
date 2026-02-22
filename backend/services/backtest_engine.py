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

logger = logging.getLogger(__name__)


class BacktestEngine:
    """Runs vectorised backtests using VectorBT Portfolio.from_signals.

    All methods are static — no instance state is needed.
    """

    @staticmethod
    def run(
        df: pd.DataFrame | dict | None,
        strategy_id: str,
        config: dict | None = None,
    ) -> dict | None:
        """Execute a backtest and return structured results.

        Args:
            df: OHLCV DataFrame (single asset) or dict of DataFrames
                (universe mode). Must not be None or empty.
            strategy_id: Strategy identifier string (e.g. '1', '3', or UUID).
            config: Backtest configuration dict. Supported keys:
                - slippage (float): Slippage % per trade. Default 0.05.
                - commission (float): Fixed commission per trade. Default 20.
                - initial_capital (float): Starting capital. Default 100000.
                - stopLossPct (float): Stop-loss %. 0 = disabled.
                - takeProfitPct (float): Take-profit %. 0 = disabled.
                - useTrailingStop (bool): Enable trailing stop. Default False.
                - pyramiding (int): Max concurrent entries. Default 1.
                - positionSizing (str): Sizing mode. Default 'Fixed Capital'.
                - positionSizeValue (float): Size value. Default 100000.
                - rankingMethod (str): Universe ranking method. Default 'No Ranking'.
                - rankingTopN (int): Top N assets to trade. Default 5.

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

        if df is None or (isinstance(df, pd.DataFrame) and df.empty):
            logger.warning("Empty dataframe provided to BacktestEngine")
            return {"status": "failed", "error": "No data found for the selected period."}

        # --- 1. CONFIGURATION ---
        slippage = float(config.get("slippage", 0.05)) / 100.0
        initial_capital = float(config.get("initial_capital", 100000.0))
        # Commission is a fixed amount per trade (e.g. Rs.20).
        # VBT fees = fraction of trade value, so divide by trade size not portfolio capital.
        commission_fixed = float(config.get("commission", 20.0))
        trade_size = float(config.get("positionSizeValue", initial_capital))
        fees = commission_fixed / trade_size if trade_size > 0 else commission_fixed / initial_capital
        sl_pct = float(config.get("stopLossPct", 0)) / 100.0
        tp_pct = float(config.get("takeProfitPct", 0)) / 100.0
        use_trailing = bool(config.get("useTrailingStop", False))
        pyramiding = int(config.get("pyramiding", 1))
        accumulate = pyramiding > 1

        # Normalize columns to Title Case before signal generation so strategies
        # can reliably access df['Close'], df['Open'], etc.
        if isinstance(df, pd.DataFrame):
            df.columns = [c.capitalize() for c in df.columns]
        elif isinstance(df, dict):
            for k in df:
                if isinstance(df[k], pd.DataFrame):
                    df[k].columns = [c.capitalize() for c in df[k].columns]

        # --- 2. GENERATE SIGNALS ---
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)

        # --- SANITISE SIGNALS (fix numba failures when dtype==object) ---
        def _boolify(sig):
            if isinstance(sig, pd.Series) or isinstance(sig, pd.DataFrame):
                try:
                    return sig.fillna(False).astype(bool)
                except Exception:
                    return sig.astype(bool)
            else:
                import numpy as _np
                return _np.asarray(sig, dtype=bool)

        entries = _boolify(entries)
        exits = _boolify(exits)

        close_price = df["Close"] if isinstance(df, pd.DataFrame) else df["Close"]
        
        # Diagnostic logging for data range
        if isinstance(df, pd.DataFrame):
            logger.info(f"BacktestEngine Execution: symbol={strategy_id}, bars={len(df)}, range={df.index.min()} to {df.index.max()}")
        elif isinstance(df, dict) and "Close" in df:
            logger.info(f"BacktestEngine Universe Execution: assets={len(df['Close'].columns)}, bars={len(df['Close'])}")

        # --- 3. FREQUENCY DETECTION ---
        # Detect VBT-compatible freq from time-delta (Issue #18)
        vbt_freq = "1D"
        try:
            sample_df = df if isinstance(df, pd.DataFrame) else df["Close"]
            if len(sample_df) > 1:
                # Use the mode (most common) time difference to ignore overnight/weekend gaps
                diffs = sample_df.index.to_series().diff()
                mode_diff = diffs.mode()[0]
                minutes = int(mode_diff.total_seconds() / 60)
                
                if minutes == 1: vbt_freq = "1m"
                elif minutes == 5: vbt_freq = "5m"
                elif minutes == 15: vbt_freq = "15m"
                elif minutes == 60: vbt_freq = "1h"
                elif minutes >= 1440: vbt_freq = "1D"
        except Exception as e:
            logger.warning(f"Freq detection failed: {e}. Defaulting to 1D")

        # --- 4. UNIVERSE RANKING ---
        entries = BacktestEngine._apply_ranking(entries, df, config)

        # --- 5. POSITION SIZING ---
        size, size_type = BacktestEngine._calculate_sizing(config)

        # --- 6. EXECUTION ---
        pf_kwargs: dict = {
            "init_cash": initial_capital,
            "fees": fees,
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
            # extract basic results (metrics, curves, trades etc.)
            results = BacktestEngine._extract_results(pf, df, config)

            # optional detailed returns statistics
            if config is not None:
                # ensure key exists even if computation fails or is skipped
                results["returnsStats"] = {}
                freq = config.get("statsFreq")
                # Keep original value for statsParams display
                original_freq = freq
                # normalize freq for vectorbt if necessary (vectorbt dislikes 'M'/'Y')
                if isinstance(freq, str) and freq.endswith('M'):
                    # convert months to 30-day periods; e.g. "1M" -> "30D"
                    try:
                        n = int(freq[:-1])
                        freq = f"{n * 30}D"
                    except Exception:
                        # fall back to None and let vectorbt choose auto
                        freq = None
                if isinstance(freq, str) and freq.endswith('Y'):
                    try:
                        n = int(freq[:-1])
                        freq = f"{n * 365}D"
                    except Exception:
                        freq = None
                # window stored for display; VectorBT ignores it
                # compute only when freq truthy and method available
                if hasattr(pf, "returns_stats") and freq:
                    try:
                        rs = pf.returns_stats(freq=freq or None)
                        if hasattr(rs, "to_dict"):
                            if hasattr(rs, "columns"):
                                results["returnsStats"] = rs.to_dict(orient="index")
                            else:
                                results["returnsStats"] = rs.to_dict()
                        else:
                            results["returnsStats"] = str(rs)
                    except Exception as e:
                        logger.warning(f"Failed to compute returns_stats: {e}")
                        # leave empty dict so frontend shows "no stats"

            return clean_float_values(results)
        except Exception as exc:
            logger.error(f"VBT Execution Error: {exc}")
            return None

    @staticmethod
    def _apply_ranking(
        entries: pd.Series | pd.DataFrame,
        df: pd.DataFrame | dict,
        config: dict,
    ) -> pd.Series | pd.DataFrame:
        """Apply universe ranking to filter entry signals to top-N assets.

        Args:
            entries: Boolean entry signal Series or DataFrame.
            df: OHLCV data (DataFrame or dict of DataFrames for universe).
            config: Backtest config dict with 'rankingMethod' and 'rankingTopN'.

        Returns:
            Filtered entry signals with only top-N assets set to True.
        """
        ranking_method = config.get("rankingMethod", "No Ranking")
        top_n = int(config.get("rankingTopN", 5))
        close_price = df["Close"] if isinstance(df, dict) else df["Close"]

        if (
            isinstance(close_price, pd.DataFrame)
            and ranking_method != "No Ranking"
            and len(close_price.columns) > top_n
        ):
            logger.info(f"Applying Ranking: {ranking_method}, Top {top_n}")
            rank_metric: pd.DataFrame | None = None

            if ranking_method == "Rate of Change":
                rank_metric = close_price.pct_change(20)
            elif ranking_method == "Relative Strength":
                rank_metric = vbt.RSI.run(close_price, window=14).rsi
            elif ranking_method == "Volatility":
                rank_metric = close_price.pct_change().rolling(20).std()
            elif ranking_method == "Volume":
                volume = df["Volume"] if isinstance(df, dict) else df["Volume"]
                rank_metric = volume.rolling(20).mean()

            if rank_metric is not None:
                rank_obj = rank_metric.rank(axis=1, ascending=False, pct=False)
                top_mask = rank_obj <= top_n
                return entries & top_mask

        return entries

    @staticmethod
    def _calculate_sizing(config: dict) -> tuple[float, str]:
        """Determine VectorBT position sizing parameters.

        Args:
            config: Backtest config dict with 'positionSizing' and
                'positionSizeValue' keys.

        Returns:
            Tuple of (size_value, size_type_string) for VBT Portfolio.
        """
        sizing_mode = config.get("positionSizing", "Fixed Capital")
        size_val = float(config.get("positionSizeValue", 100000))

        if sizing_mode == "Fixed Capital":
            return size_val, "value"
        elif sizing_mode == "% of Equity":
            return size_val / 100.0, "percent"
        elif sizing_mode == "Risk Based (ATR)":
            return 0.05, "percent"

        return np.inf, "amount"

    @staticmethod
    def _extract_results(
        pf: vbt.Portfolio,
        df: pd.DataFrame | dict,
        config: dict | None = None,
    ) -> dict:
        """Extract structured results from a VectorBT Portfolio object.

        Args:
            pf: Completed VectorBT Portfolio instance.
            df: Original OHLCV data used for the backtest (needed for
                deriving real start/end dates — fixes Issue #15).

        Returns:
            Dict with keys: metrics (dict), equityCurve (list[dict]),
            trades (list[dict]), monthlyReturns (list[dict]),
            startDate (str), endDate (str).
        """
        is_universe = (
            isinstance(pf.wrapper.columns, pd.Index)
            and len(pf.wrapper.columns) > 1
        )

        # --- Fix Issue #15: derive real dates from data ---
        if isinstance(df, dict):
            idx = df["Close"].index
        else:
            idx = df.index
        start_date = str(idx[0].date()) if len(idx) > 0 else "N/A"
        end_date = str(idx[-1].date()) if len(idx) > 0 else "N/A"

        metrics: dict = {}
        trades: list[dict] = []
        equity_curve: list[dict] = []
        monthly_returns_data: list[dict] = []

        if is_universe:
            total_value = pf.value().sum(axis=1)
            total_return = (total_value.iloc[-1] - total_value.iloc[0]) / total_value.iloc[0]
            # Compute drawdown from the aggregated universe portfolio value
            running_max = total_value.cummax()
            dd_universe = ((total_value - running_max) / running_max) * 100
            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": round(abs(dd_universe.loc[d]), 2)}
                for d, v in total_value.items()
            ]

            # win rate and profit factor may not exist on all VectorBT builds;
            # use safe helpers that fall back to stats or zero when missing.
            win_rate_val = BacktestEngine._safe_win_rate(pf, universe=True)
            profit_factor_val = BacktestEngine._safe_profit_factor(pf, universe=True)

            metrics = {
                "totalReturnPct": round(total_return * 100, 2),
                "sharpeRatio": round(pf.sharpe_ratio().mean(), 2),
                "maxDrawdownPct": round(abs(pf.max_drawdown().max()) * 100, 2),
                "winRate": win_rate_val,
                "profitFactor": profit_factor_val,
                "totalTrades": int(pf.trades.count().sum()),
                "alpha": 0.0, "beta": 0.0, "volatility": 0.0, "cagr": 0.0,
                "sortinoRatio": 0.0, "calmarRatio": 0.0,
                **BacktestEngine._compute_advanced_metrics(pf, universe=True),
                "status": "completed"
            }
        else:
            stats = pf.stats()
            # VectorBT 0.20+ uses methods for returns and drawdown
            equity = pf.value()
            returns_series = pf.returns() if callable(pf.returns) else pf.returns
            dd_series = pf.drawdown() if callable(pf.drawdown) else pf.drawdown
            dd_pct = dd_series * 100

            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": round(abs(dd_pct.loc[d]), 2)}
                for d, v in equity.items()
            ]

            if hasattr(pf.trades, "records_readable"):
                for i, row in pf.trades.records_readable.iterrows():
                    trades.append({
                        "id": f"t-{i}",
                        "entryDate": str(row["Entry Timestamp"]),
                        "exitDate": str(row["Exit Timestamp"]),
                        "side": "LONG" if row["Direction"] == "Long" else "SHORT",
                        "entryPrice": round(row["Avg Entry Price"], 2),
                        "exitPrice": round(row["Avg Exit Price"], 2),
                        "pnl": round(row["PnL"], 2),
                        "pnlPct": round(row["Return"] * 100, 2),
                        "status": "WIN" if row["PnL"] > 0 else "LOSS",
                    })

            # Compute true CAGR: (final/initial)^(1/years) - 1
            total_return = pf.total_return()
            years = (idx[-1] - idx[0]).days / 365.25 if len(idx) > 1 else 1.0
            if years > 0 and total_return > -1:
                cagr_val = round(((1 + total_return) ** (1.0 / years) - 1) * 100, 2)
            else:
                cagr_val = round(total_return * 100, 2)

            metrics = {
                "totalReturnPct": round(total_return * 100, 2),
                "sharpeRatio": round(stats.get("Sharpe Ratio", 0), 2),
                "maxDrawdownPct": round(abs(stats.get("Max Drawdown [%]", 0)), 2),
                # stats may already include a win rate percentage; normalize to one decimal
                "winRate": round(stats.get("Win Rate [%]", 0), 1),
                "profitFactor": round(stats.get("Profit Factor", 0), 2),
                "totalTrades": int(stats.get("Total Trades", 0)),
                "alpha": round(float(stats.get("Alpha", 0)), 2),
                "beta": round(float(stats.get("Beta", 0)), 2),
                "volatility": round(float(stats.get("Volatility (Ann.) [%]", 0)), 1),
                "cagr": cagr_val,
                "sortinoRatio": round(float(stats.get("Sortino Ratio", 0)), 2),
                "calmarRatio": round(float(stats.get("Calmar Ratio", 0)), 2),
                **BacktestEngine._compute_advanced_metrics(pf, universe=False),
                "status": "completed"
            }
            
            # --- Diagnostic Alerts ---
            # AlertManager expects {"metrics": {...}} wrapper, not raw metrics dict
            metrics["alerts"] = AlertManager.analyze_backtest({"metrics": metrics}, df)

            try:
                # Use returns_series calculated above
                # Pandas 2.0 removed the bare "M" alias; use month-end "ME"
                try:
                    monthly_resampled = returns_series.resample("ME").apply(
                        lambda x: (1 + x).prod() - 1
                    )
                except ValueError:
                    # older pandas may still support "M"; fall back if necessary
                    monthly_resampled = returns_series.resample("M").apply(
                        lambda x: (1 + x).prod() - 1
                    )
                for date, ret in monthly_resampled.items():
                    monthly_returns_data.append({
                        "year": date.year,
                        "month": date.month - 1,  # JS uses 0-indexed months
                        "returnPct": round(ret * 100, 2),
                    })
            except Exception as exc:
                logger.warning(f"Failed to calculate monthly returns: {exc}")

        # If config omitted just omit statsParams silently
        results: dict = {
            "metrics": metrics,
            "equityCurve": equity_curve,
            "trades": trades[::-1],
            "monthlyReturns": monthly_returns_data,
            "startDate": start_date,
            "endDate": end_date,
        }
        if config is not None:
            results["statsParams"] = {"freq": config.get("statsFreq"), "window": config.get("statsWindow")}
        return results

    @staticmethod
    def _safe_win_rate(pf: vbt.Portfolio, universe: bool = False) -> float:
        """Return the portfolio win rate as a percentage.

        VectorBT has historically exposed ``pf.win_rate()`` but some versions
        ship without it and calling the method raises ``AttributeError``.
        To keep the engine robust we try several approaches in order:

        1. If ``pf.win_rate`` exists and is callable, call it and take the
           mean (universe portfolios return a ``Series``).
        2. Inspect ``pf.trades.records_readable`` to compute wins/total trades.
        3. Fall back to ``pf.stats()`` and look for a ``"Win Rate [%]"`` field.
        4. Return ``0.0`` if nothing else works.

        Args:
            pf: VectorBT Portfolio instance
            universe: unused for now but kept for future custom handling
        """
        # 1. try the built‑in method
        try:
            method = getattr(pf, "win_rate", None)
            if callable(method):
                val = method()
                # result may be scalar or Series
                if hasattr(val, "mean"):
                    return round(val.mean() * 100, 1)
                else:
                    return round(float(val) * 100, 1)
        except Exception:
            pass

        # 2. compute from trades if available
        try:
            rec = getattr(pf.trades, "records_readable", None)
            if rec is not None and len(rec) > 0:
                wins = rec[rec.get("PnL", 0) > 0].shape[0]
                total = rec.shape[0]
                return round((wins / total) * 100, 1) if total > 0 else 0.0
        except Exception:
            pass

        # 3. stats fallback
        try:
            stats = pf.stats()
            wr = stats.get("Win Rate [%]", 0)
            if hasattr(wr, "mean"):
                return round(wr.mean(), 1)
            else:
                return round(float(wr), 1)
        except Exception:
            pass

        # last resort
        return 0.0


    @staticmethod
    def _safe_profit_factor(pf: vbt.Portfolio, universe: bool = False) -> float:
        """Return profit factor as a float; handle missing VectorBT method gracefully.

        The built-in ``pf.profit_factor()`` may not be defined in some releases.
        We attempt to call it; if unavailable we look at ``pf.stats()`` for a
        "Profit Factor" key. If all else fails we return 0.0.
        """
        try:
            method = getattr(pf, "profit_factor", None)
            if callable(method):
                val = method()
                if hasattr(val, "mean"):
                    return round(val.mean(), 2)
                else:
                    return round(float(val), 2)
        except Exception:
            pass
        try:
            stats = pf.stats()
            pfv = stats.get("Profit Factor", 0)
            if hasattr(pfv, "mean"):
                return round(pfv.mean(), 2)
            else:
                return round(float(pfv), 2)
        except Exception:
            pass
        return 0.0

    def _compute_advanced_metrics(pf: vbt.Portfolio, universe: bool = False) -> dict:
        """Compute expectancy, consecutive losses, Kelly criterion, avg drawdown duration.

        These metrics are not directly exposed by VectorBT and require
        custom calculation from the trades records.

        Args:
            pf: Completed VectorBT Portfolio instance.
            universe: If True, aggregates across all assets in the portfolio.

        Returns:
            Dict with keys: expectancy (float), consecutiveLosses (int),
            kellyCriterion (float), avgDrawdownDuration (str).
        """
        try:
            if universe:
                # Aggregate all trade PnLs across assets
                try:
                    all_pnl = pf.trades.records_readable["PnL"].values
                except Exception:
                    all_pnl = np.array([])
            else:
                try:
                    all_pnl = pf.trades.records_readable["PnL"].values
                except Exception:
                    all_pnl = np.array([])

            if len(all_pnl) == 0:
                return {
                    "expectancy": 0.0,
                    "consecutiveLosses": 0,
                    "kellyCriterion": 0.0,
                    "avgDrawdownDuration": "0d",
                }

            wins = all_pnl[all_pnl > 0]
            losses = all_pnl[all_pnl <= 0]
            n_total = len(all_pnl)
            n_wins = len(wins)
            n_losses = len(losses)

            win_rate = n_wins / n_total if n_total > 0 else 0.0
            avg_win = float(np.mean(wins)) if n_wins > 0 else 0.0
            avg_loss = float(np.mean(np.abs(losses))) if n_losses > 0 else 0.0

            # Expectancy: (win_rate * avg_win) - (loss_rate * avg_loss)
            expectancy = round((win_rate * avg_win) - ((1 - win_rate) * avg_loss), 2)

            # Kelly Criterion: W - (1-W)/R  where R = avg_win / avg_loss
            if avg_loss > 0 and avg_win > 0:
                r_ratio = avg_win / avg_loss
                kelly = win_rate - ((1 - win_rate) / r_ratio)
                kelly = round(max(0.0, min(kelly, 1.0)) * 100, 1)  # as %
            else:
                kelly = 0.0

            # Max consecutive losses
            max_consec = 0
            current_consec = 0
            for pnl in all_pnl:
                if pnl <= 0:
                    current_consec += 1
                    max_consec = max(max_consec, current_consec)
                else:
                    current_consec = 0

            # Average drawdown duration
            try:
                raw_dd = pf.drawdown() if callable(pf.drawdown) else pf.drawdown
                dd_series = raw_dd if not universe else raw_dd.mean(axis=1)
                in_dd = dd_series < 0
                # Count consecutive bars in drawdown
                durations = []
                count = 0
                for val in in_dd:
                    if val:
                        count += 1
                    elif count > 0:
                        durations.append(count)
                        count = 0
                if count > 0:
                    durations.append(count)
                avg_dur = int(np.mean(durations)) if durations else 0
                avg_dd_duration = f"{avg_dur}d"
            except Exception:
                avg_dd_duration = "0d"

            return {
                "expectancy": expectancy,
                "consecutiveLosses": int(max_consec),
                "kellyCriterion": kelly,
                "avgDrawdownDuration": avg_dd_duration,
            }

        except Exception as exc:
            logger.warning(f"Advanced metrics calculation failed: {exc}")
            return {
                "expectancy": 0.0,
                "consecutiveLosses": 0,
                "kellyCriterion": 0.0,
                "avgDrawdownDuration": "0d",
            }
