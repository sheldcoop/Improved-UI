import pandas as pd
import numpy as np

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
        Output: DataFrame with 'Signal' column (1=Long, -1=Short, 0=Neutral).
        """
        raise NotImplementedError("Strategies must implement generate_signals")

class SmaCrossover(BaseStrategy):
    def generate_signals(self, df):
        fast_period = int(self.config.get('fast', 10))
        slow_period = int(self.config.get('slow', 50))
        
        # Vectorized Rolling Calculations
        df['SMA_Fast'] = df['Close'].rolling(window=fast_period).mean()
        df['SMA_Slow'] = df['Close'].rolling(window=slow_period).mean()
        
        # Vectorized Signal Generation (Boolean Masking)
        df['Signal'] = 0
        df.loc[df['SMA_Fast'] > df['SMA_Slow'], 'Signal'] = 1
        df.loc[df['SMA_Fast'] < df['SMA_Slow'], 'Signal'] = -1
        
        return df

class RsiMeanReversion(BaseStrategy):
    def generate_signals(self, df):
        period = int(self.config.get('period', 14))
        lower_bound = int(self.config.get('lower', 30))
        upper_bound = int(self.config.get('upper', 70))
        
        # Vectorized RSI Calculation
        delta = df['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        rs = gain / loss
        df['RSI'] = 100 - (100 / (1 + rs))
        
        # Logic: Buy when oversold, Sell when overbought
        df['Signal'] = 0
        df.loc[df['RSI'] < lower_bound, 'Signal'] = 1
        df.loc[df['RSI'] > upper_bound, 'Signal'] = -1
        
        return df

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
