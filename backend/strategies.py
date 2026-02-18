import pandas as pd
import numpy as np
import vectorbt as vbt

class BaseStrategy:
    """
    Abstract base class for all strategies.
    Enforces the implementation of the `generate_signals` method.
    """
    def __init__(self, config):
        self.config = config

    def generate_signals(self, df):
        """
        Input: DataFrame with OHLCV data.
        Output: Tuple (entries, exits) - Boolean Series
        """
        raise NotImplementedError("Strategies must implement generate_signals")

class SmaCrossover(BaseStrategy):
    def generate_signals(self, df):
        fast_period = int(self.config.get('fast', 10))
        slow_period = int(self.config.get('slow', 50))
        
        # Calculate MA using vectorbt's optimized indicator
        fast_ma = vbt.MA.run(df['Close'], window=fast_period)
        slow_ma = vbt.MA.run(df['Close'], window=slow_period)
        
        # Generate Crossover Signals
        entries = fast_ma.ma_crossed_above(slow_ma)
        exits = fast_ma.ma_crossed_below(slow_ma)
        
        return entries, exits

class RsiMeanReversion(BaseStrategy):
    def generate_signals(self, df):
        period = int(self.config.get('period', 14))
        lower_bound = int(self.config.get('lower', 30))
        upper_bound = int(self.config.get('upper', 70))
        
        # Calculate RSI using vectorbt
        rsi = vbt.RSI.run(df['Close'], window=period)
        
        # Logic: Buy crossing below 30, Sell crossing above 70
        entries = rsi.rsi_crossed_below(lower_bound)
        exits = rsi.rsi_crossed_above(upper_bound)
        
        return entries, exits

class StrategyFactory:
    @staticmethod
    def get_strategy(strategy_id, config):
        if strategy_id == "3": # SMA Cross
            return SmaCrossover(config)
        elif strategy_id == "1": # RSI
            return RsiMeanReversion(config)
        else:
            # Default to SMA if unknown
            return SmaCrossover(config)
