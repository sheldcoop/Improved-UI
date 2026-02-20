import pandas as pd
import logging

logger = logging.getLogger(__name__)

class AlertManager:
    """Diagnostic system for detecting common strategy pitfalls and data issues."""

    # Configurable alerting thresholds
    WIN_RATE_OVERFIT_THRESHOLD = 100.0
    MIN_TRADES_REQUIRED = 5
    MAX_SAFE_DRAWDOWN_PCT = 40.0
    MIN_AVG_TRADES_WFO = 3.0
    WFO_LOSING_MAJORITY_FRAC = 0.5  # If more than 50% windows are losing

    @staticmethod
    def _add_alert(alerts: list, level: str, msg: str) -> None:
        """Standardize alert creation structure."""
        alerts.append({"type": level, "msg": msg})

    @staticmethod
    def analyze_backtest(results: dict, df: pd.DataFrame) -> list[dict]:
        """Analyze backtest results for potential issues.
        
        Args:
            results: Standard results dict from BacktestEngine.
            df: The OHLCV DataFrame used for the backtests.
            
        Returns:
            List of alert objects: [{"type": "warning" | "success" | "error", "msg": "..."}]
        """
        alerts = []
        metrics = results.get("metrics", {})
        
        # 1. Overfitting Check (Win Rate)
        win_rate = metrics.get("winRate", 0)
        total_trades = metrics.get("totalTrades", 0)
        if total_trades > 0 and win_rate >= AlertManager.WIN_RATE_OVERFIT_THRESHOLD:
            AlertManager._add_alert(
                alerts, "warning", 
                f"Win Rate {win_rate}% → Likely overfitted or look-ahead bias detected."
            )

        # 2. Low trade count (Sampling Bias)
        if 0 < total_trades < AlertManager.MIN_TRADES_REQUIRED:
            AlertManager._add_alert(
                alerts, "warning", 
                f"Only {total_trades} trades → Sample size too small for statistical significance."
            )

        # 3. Drawdown check
        max_dd = metrics.get("maxDrawdownPct", 0)
        if max_dd > AlertManager.MAX_SAFE_DRAWDOWN_PCT:
             AlertManager._add_alert(
                alerts, "warning", 
                f"Extreme Drawdown ({max_dd:.1f}%) → Risk of ruin is very high."
            )

        # Note: Data health checks (gap detection) are now securely handled by DataHealthService
        # and displayed on the UI via the Data validation endpoint rather than post-backtest heuristics.

        if not alerts:
            AlertManager._add_alert(alerts, "success", "All diagnostic checks passed → Safe to proceed.")
            
        return alerts

    @staticmethod
    def analyze_wfo(results: list[dict], df: pd.DataFrame) -> list[dict]:
        """Analyze Walk-Forward Optimization results for potential issues."""
        alerts = []
        
        # Check if WFO returned any data
        if not results or (isinstance(results, dict) and "error" in results):
             AlertManager._add_alert(alerts, "error", "WFO failed to generate any data.")
             return alerts

        # Average trades per window
        total_trades = sum([w.get("trades", 0) for w in results])
        avg_trades = total_trades / len(results) if len(results) > 0 else 0
        
        if avg_trades < AlertManager.MIN_AVG_TRADES_WFO:
            AlertManager._add_alert(
                alerts, "warning", 
                f"Low Avg Trades ({avg_trades:.1f}/window) → WFO windows may be too small."
            )

        # Check for consistency of return across windows
        returns = [w.get("returnPct", 0) for w in results]
        if returns:
            neg_windows = len([r for r in returns if r < 0])
            if neg_windows > len(results) * AlertManager.WFO_LOSING_MAJORITY_FRAC:
                AlertManager._add_alert(
                    alerts, "warning", 
                    f"Majority of windows are losing ({neg_windows}/{len(results)}) → Strategy is inconsistent."
                )

        if not alerts:
             AlertManager._add_alert(alerts, "success", "WFO checks passed → Dynamic parameters showing stability.")

        return alerts
