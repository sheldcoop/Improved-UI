import math
import numpy as np
import pandas as pd
import pytest

from services.backtest_engine import BacktestEngine

def _make_trend_data() -> pd.DataFrame:
    """Generate a simple, highly predictable upward trend with small pullbacks."""
    idx = pd.date_range("2020-01-01", periods=100, freq="D")
    
    # Simple linear price path: 100 -> 200
    close = np.linspace(100.0, 200.0, 100)
    
    # Introduce small known pullbacks to create multiple trades
    # Day 20-30: drops to 110
    close[20:30] = np.linspace(120, 110, 10)
    # Day 60-70: drops to 150
    close[60:70] = np.linspace(160, 150, 10)
    
    df = pd.DataFrame(
        {
            "open": close * 0.99,
            "high": close * 1.01,
            "low": close * 0.98,
            "close": close,
            "volume": np.full(100, 100_000),
        },
        index=idx,
    )
    return df

class TestBacktestMathVerification:
    """
    These tests DO NOT use mock objects. They pass real data through the
    BacktestEngine and VectorBT, and cross-check the statistical outputs
    against predictable manual mathematical formulas.
    """

    def test_total_return_and_cagr_math(self):
        """Cross-checks Total Return and CAGR against a simple Buy & Hold manual calculation."""
        df = _make_trend_data()
        
        # Strategy: Buy on Day 1, hold until Day 100.
        config = {
            "mode": "CODE",
            "pythonCode": """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits = pd.Series(False, index=df.index)
    entries.iloc[0] = True # Buy day 1
    exits.iloc[-1] = True  # Sell last day
    return entries, exits
""",
            "initial_capital": 100000,
            "commission": 0, # zero commission for pure math check
            "slippage": 0,
            "positionSizing": "% of Equity", # Invest 100% of equity
            "positionSizeValue": 100.0,
        }

        result = BacktestEngine.run(df, strategy_id="custom", config=config)
        
        assert result is not None
        assert result.get("status", "") != "failed"
        
        metrics = result["metrics"]
        
        # --- Manual Math Check ---
        start_price = df["close"].iloc[0] # 100.0
        end_price = df["close"].iloc[-1]   # 200.0
        trade_return_pct = (end_price / start_price) - 1.0 # 100%
        
        # Total Return check
        expected_total_return_pct = trade_return_pct * 100
        assert math.isclose(metrics["totalReturnPct"], expected_total_return_pct, rel_tol=1e-3)
        
        # CAGR Check 
        # 99 calendar days duration (100 periods) annualized over roughly 365 days
        years = 99 / 365.25
        expected_cagr = ((end_price / start_price) ** (1 / years)) - 1.0
        expected_cagr_pct = expected_cagr * 100
        print("METRICS:", metrics)
        assert math.isclose(metrics["cagr"], expected_cagr_pct, rel_tol=1e-2)

    def test_win_rate_and_profit_factor(self):
        """Forces exactly 2 winning trades and 1 losing trade to verify basic ratios."""
        df = _make_trend_data()
        
        config = {
            "mode": "CODE",
            "pythonCode": """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits = pd.Series(False, index=df.index)
    
    # Trade 1: Win (Buy 101, Sell 120)
    entries.iloc[1] = True
    exits.iloc[19] = True
    
    # Trade 2: Loss (Buy 118, Sell 110)
    entries.iloc[21] = True
    exits.iloc[29] = True
    
    # Trade 3: Win (Buy 130, Sell 160)
    entries.iloc[35] = True
    exits.iloc[59] = True
    
    return entries, exits
""",
            "initial_capital": 100000,
            "commission": 0,
            "slippage": 0,
            "positionSizing": "value", 
            "positionSizeValue": 1.0, # 1 unit per trade to make math simple
        }

        result = BacktestEngine.run(df, strategy_id="custom", config=config)
        metrics = result["metrics"]
        
        assert metrics["totalTrades"] == 3
        
        # --- Win Rate Check ---
        # 2 wins, 1 loss = 66.67%
        expected_win_rate = (2 / 3) * 100
        assert math.isclose(metrics["winRate"], expected_win_rate, rel_tol=1e-2)
        
        # --- Profit Factor Check ---
        # PnL roughly:
        # T1: 120 - 101.01 = +~19
        # T2: 110 - 117.8 = -~7.8
        # T3: 160.6 - 131.3 = +~29.3
        # We check that PF > 1.0 since gross profits heavily outweigh gross losses
        assert metrics["profitFactor"] > 1.0
        
    def test_max_drawdown_math(self):
        """Tests that a known price drop accurately reflects in Max Drawdown."""
        df = _make_trend_data()
        
        # Between bar 20 and 30, price drops from 120 to 110 (-8.3%)
        config = {
            "mode": "CODE",
            "pythonCode": """
def signal_logic(df):
    entries = pd.Series(False, index=df.index)
    exits = pd.Series(False, index=df.index)
    # Buy before drop, sell after drop
    entries.iloc[15] = True
    exits.iloc[35] = True
    return entries, exits
""",
            "initial_capital": 100000,
            "commission": 0,
            "slippage": 0,
            "positionSizing": "% of Equity", 
            "positionSizeValue": 100.0, 
        }

        result = BacktestEngine.run(df, strategy_id="custom", config=config)
        metrics = result["metrics"]
        
        # The peak equity should be right before the drop (Day 19, price ~120)
        # The trough should be at the bottom of the drop (Day 29, price ~110)
        # Known drop is ~8.33%
        expected_drawdown = ((120 - 110) / 120) * 100
        
        # MaxDrawdownPct is returned as a positive absolute float
        assert metrics["maxDrawdownPct"] > 0
        assert math.isclose(metrics["maxDrawdownPct"], expected_drawdown, abs_tol=1.5)

