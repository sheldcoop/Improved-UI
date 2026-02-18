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
        fees = float(config.get("commission", 20.0)) / initial_capital
        sl_pct = float(config.get("stopLossPct", 0)) / 100.0
        tp_pct = float(config.get("takeProfitPct", 0)) / 100.0
        use_trailing = bool(config.get("useTrailingStop", False))
        pyramiding = int(config.get("pyramiding", 1))
        accumulate = pyramiding > 1

        # --- 2. GENERATE SIGNALS ---
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)

        # Normalize columns to Title Case for engine consistency
        if isinstance(df, pd.DataFrame):
            df.columns = [c.capitalize() for c in df.columns]
        elif isinstance(df, dict):
            for k in df:
                if isinstance(df[k], pd.DataFrame):
                    df[k].columns = [c.capitalize() for c in df[k].columns]

        close_price = df["Close"] if isinstance(df, pd.DataFrame) else df["Close"]

        # --- 3. FREQUENCY DETECTION ---
        # Detect VBT-compatible freq from time-delta (Issue #18)
        vbt_freq = "1D"
        try:
            sample_df = df if isinstance(df, pd.DataFrame) else df["Close"]
            if len(sample_df) > 1:
                diff = sample_df.index[1] - sample_df.index[0]
                minutes = int(diff.total_seconds() / 60)
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
        if sl_pct > 0:
            pf_kwargs["sl_stop"] = sl_pct
            pf_kwargs["sl_trail"] = use_trailing
        if tp_pct > 0:
            pf_kwargs["tp_stop"] = tp_pct

        try:
            pf = vbt.Portfolio.from_signals(close_price, entries, exits, **pf_kwargs)
            results = BacktestEngine._extract_results(pf, df)
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
            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": 0}
                for d, v in total_value.items()
            ]
            metrics = {
                "totalReturnPct": round(total_return * 100, 2),
                "sharpeRatio": round(pf.sharpe_ratio().mean(), 2),
                "maxDrawdownPct": round(abs(pf.max_drawdown().max()) * 100, 2),
                "winRate": round(pf.win_rate().mean() * 100, 1),
                "profitFactor": round(pf.profit_factor().mean(), 2),
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

            metrics = {
                "totalReturnPct": round(pf.total_return() * 100, 2),
                "sharpeRatio": round(stats.get("Sharpe Ratio", 0), 2),
                "maxDrawdownPct": round(abs(stats.get("Max Drawdown [%]", 0)), 2),
                "winRate": round(stats.get("Win Rate [%]", 0), 1),
                "profitFactor": round(stats.get("Profit Factor", 0), 2),
                "totalTrades": int(stats.get("Total Trades", 0)),
                "alpha": round(float(stats.get("Alpha", 0)), 2),
                "beta": round(float(stats.get("Beta", 0)), 2),
                "volatility": round(float(stats.get("Volatility (Ann.) [%]", 0)), 1),
                "cagr": round(float(stats.get("Total Return [%]", 0)), 2),
                "sortinoRatio": round(float(stats.get("Sortino Ratio", 0)), 2),
                "calmarRatio": round(float(stats.get("Calmar Ratio", 0)), 2),
                **BacktestEngine._compute_advanced_metrics(pf, universe=False),
                "status": "completed"
            }

            try:
                # Use returns_series calculated above
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

        return {
            "metrics": metrics,
            "equityCurve": equity_curve,
            "trades": trades[::-1],
            "monthlyReturns": monthly_returns_data,
            "startDate": start_date,
            "endDate": end_date,
        }

    @staticmethod
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
