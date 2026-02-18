import pandas as pd
import numpy as np
import vectorbt as vbt
from logging import getLogger

logger = getLogger(__name__)

class BaseStrategy:
    def __init__(self, config):
        self.config = config

    def generate_signals(self, df):
        raise NotImplementedError("Strategies must implement generate_signals")

class DynamicStrategy(BaseStrategy):
    """
    Parses frontend JSON rules and executes them using VectorBT.
    """
    def _get_series(self, df, indicator_type, period):
        """Helper to get vectorbt series based on indicator type"""
        period = int(period) if period else 14
        
        # Handle Universe (MultiIndex Columns) or Single Asset
        # If df['Close'] is a DataFrame, VBT operations broadcast automatically.
        
        close = df['Close']
        volume = df.get('Volume', None)

        if indicator_type == 'RSI':
            return vbt.RSI.run(close, window=period).rsi
        elif indicator_type == 'SMA':
            return vbt.MA.run(close, window=period).ma
        elif indicator_type == 'EMA':
            # VectorBT MA doesn't have direct EWM flag in simple API, using pandas for speed
            return close.ewm(span=period, adjust=False).mean()
        elif indicator_type == 'Close Price':
            return close
        elif indicator_type == 'Volume':
            return volume if volume is not None else close # Fallback
        else:
            return close

    def _evaluate_rule(self, df, rule):
        """Converts a single rule into a boolean Series/DataFrame"""
        try:
            # Left side
            left_series = self._get_series(df, rule['indicator'], rule.get('period'))
            
            # Right side (Value or another indicator - simplified to Value for now)
            right_val = float(rule['value'])
            
            op = rule['operator']
            
            if op == 'Crosses Above':
                return left_series.vbt.crossed_above(right_val)
            elif op == 'Crosses Below':
                return left_series.vbt.crossed_below(right_val)
            elif op == '>':
                return left_series > right_val
            elif op == '<':
                return left_series < right_val
            elif op == '=':
                return left_series == right_val
            else:
                return False
        except Exception as e:
            logger.error(f"Rule Evaluation Error: {e}")
            return False

    def generate_signals(self, df):
        # Initialize signals as all True (for AND logic)
        # If df['Close'] is DataFrame (Universe), these will be DataFrames of True
        entries = df['Close'] > -1 # Hack to get a True mask with correct shape
        exits = df['Close'] > -1
        
        entry_rules = self.config.get('entryRules', [])
        exit_rules = self.config.get('exitRules', [])
        filter_rules = self.config.get('filterRules', [])

        # 1. Apply Regime Filters (Global "Green Light")
        # Example: Close > SMA(200)
        regime_mask = df['Close'] > -1
        if filter_rules:
            for rule in filter_rules:
                regime_mask = regime_mask & self._evaluate_rule(df, rule)

        # 2. Process Entry Rules (AND logic)
        if not entry_rules:
            entries = entries & False # No rules = No trades
        else:
            for rule in entry_rules:
                entries = entries & self._evaluate_rule(df, rule)
        
        # Apply regime filter to entries
        entries = entries & regime_mask

        # 3. Process Exit Rules (AND logic)
        if not exit_rules:
            # If no exit rules, rely on Stop Loss / Take Profit exclusively
            exits = exits & False 
        else:
            for rule in exit_rules:
                exits = exits & self._evaluate_rule(df, rule)
        
        return entries, exits

class SmaCrossover(BaseStrategy):
    def generate_signals(self, df):
        fast = int(self.config.get('fast', 10))
        slow = int(self.config.get('slow', 50))
        fast_ma = vbt.MA.run(df['Close'], window=fast)
        slow_ma = vbt.MA.run(df['Close'], window=slow)
        entries = fast_ma.ma_crossed_above(slow_ma)
        exits = fast_ma.ma_crossed_below(slow_ma)
        return entries, exits

class RsiMeanReversion(BaseStrategy):
    def generate_signals(self, df):
        period = int(self.config.get('period', 14))
        lower = int(self.config.get('lower', 30))
        upper = int(self.config.get('upper', 70))
        rsi = vbt.RSI.run(df['Close'], window=period)
        entries = rsi.rsi_crossed_below(lower)
        exits = rsi.rsi_crossed_above(upper)
        return entries, exits

class StrategyFactory:
    @staticmethod
    def get_strategy(strategy_id, config):
        # If config contains raw rules, use DynamicStrategy
        if 'entryRules' in config and len(config['entryRules']) > 0:
            return DynamicStrategy(config)
            
        # Fallback to hardcoded IDs
        if strategy_id == "3": return SmaCrossover(config)
        elif strategy_id == "1": return RsiMeanReversion(config)
        else: return SmaCrossover(config)
