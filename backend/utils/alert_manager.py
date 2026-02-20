import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class AlertManager:
    """Diagnostic system for detecting common strategy pitfalls and data issues."""

    @staticmethod
    def analyze_backtest(results: dict, df: pd.DataFrame) -> list[dict]:
        """Analyze backtest results for potential issues.
        
        Args:
            results: Standard results dict from BacktestEngine.
            df: The OHLCV DataFrame used for the backtests.
            
        Returns:
            List of alert objects: [{"type": "warning" | "success" | "info", "msg": "..."}]
        """
        alerts = []
        metrics = results.get("metrics", {})
        
        # 1. Overfitting Check (Win Rate)
        win_rate = metrics.get("winRate", 0)
        total_trades = metrics.get("totalTrades", 0)
        if total_trades > 0 and win_rate >= 100:
            alerts.append({
                "type": "warning",
                "msg": "Win Rate 100% → Likely overfitted or look-ahead bias detected."
            })

        # 2. Low trade count (Sampling Bias)
        if total_trades > 0 and total_trades < 5:
            alerts.append({
                "type": "warning",
                "msg": f"Only {total_trades} trades → Sample size too small for statistical significance."
            })

        # 3. Data Gap Detection
        # df can be a dict (universe mode) — only run gap check on single-asset DataFrames
        if isinstance(df, pd.DataFrame) and not df.empty:
            # Check for gaps (assuming daily data, ignoring weekends)
            expected_days = (df.index.max() - df.index.min()).days
            # Approximate trading days: 5/7 of total days
            actual_days = len(df)
            if actual_days < (expected_days * 0.65): # Heuristic for missing chunks
                 alerts.append({
                    "type": "warning",
                    "msg": "Significant data gaps detected in the backtest range."
                })

        # 4. Drawdown check
        max_dd = metrics.get("maxDrawdownPct", 0)
        if max_dd > 40:
             alerts.append({
                "type": "warning",
                "msg": f"Extreme Drawdown ({max_dd:.1f}%) → Risk of ruin is very high."
            })

        if not alerts:
            alerts.append({
                "type": "success",
                "msg": "All diagnostic checks passed → Safe to proceed."
            })
            
        return alerts

    @staticmethod
    def analyze_wfo(results: list[dict], df: pd.DataFrame) -> list[dict]:
        """Analyze WFO results for potential issues."""
        alerts = []
        
        # Check if WFO returned any data
        if not results or (isinstance(results, dict) and "error" in results):
             return [{"type": "error", "msg": "WFO failed to generate any data."}]

        # Average trades per window
        total_trades = sum([w.get("trades", 0) for w in results])
        avg_trades = total_trades / len(results) if len(results) > 0 else 0
        
        if avg_trades < 3:
            alerts.append({
                "type": "warning",
                "msg": f"Low Avg Trades ({avg_trades:.1f}/window) → WFO windows may be too small."
            })

        # Check for consistency of return across windows
        returns = [w.get("returnPct", 0) for w in results]
        if returns:
            neg_windows = len([r for r in returns if r < 0])
            if neg_windows > len(results) / 2:
                alerts.append({
                    "type": "warning",
                    "msg": f"Majority of windows are losing ({neg_windows}/{len(results)}) → Strategy is inconsistent."
                })

        if not alerts:
             alerts.append({
                "type": "success",
                "msg": "WFO checks passed → Dynamic parameters showing stability."
            })

        return alerts
