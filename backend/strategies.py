
import pandas as pd
import numpy as np
import vectorbt as vbt
from logging import getLogger
import pandas_ta as ta # Ensure pandas_ta is installed for advanced indicators

logger = getLogger(__name__)

class BaseStrategy:
    def __init__(self, config):
        self.config = config
        # Cache for resampled dataframes to avoid re-computing for every rule
        self.resampled_cache = {} 

    def generate_signals(self, df):
        raise NotImplementedError("Strategies must implement generate_signals")

class DynamicStrategy(BaseStrategy):
    """
    Advanced Strategy Engine v2.0
    Supports: Recursive Logic, Indicator Comparisons, Time Filters, Code Injection.
    """
    
    def _get_series(self, df, indicator_type, period=14, timeframe=None):
        """
        Helper to get indicator series (Left or Right side).
        Handles Multi-Timeframe (MTF) Resampling.
        """
        base_df = df
        is_universe = isinstance(df, dict)
        
        # 1. Handle MTF Resampling if 'timeframe' is specified
        if timeframe:
             # Check Cache first
             cache_key = f"{timeframe}_{'UNIVERSE' if is_universe else 'SINGLE'}"
             
             if cache_key in self.resampled_cache:
                 base_df = self.resampled_cache[cache_key]
             else:
                 # Mapping frontend Timeframe enum to Pandas offset aliases
                 tf_map = {'1m': '1T', '5m': '5T', '15m': '15T', '1h': '1H', '1d': '1D'}
                 pandas_freq = tf_map.get(timeframe)
                 
                 if pandas_freq:
                     try:
                         if is_universe:
                             # For Universe (dict of DFs), we must resample each DataFrame in the dict
                             resampled_dict = {}
                             # Define aggregation rules
                             agg_rules = {
                                 'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'
                             }
                             
                             # We assume keys match Standard OHLCV
                             for col_name, data in df.items():
                                 rule = agg_rules.get(col_name, 'last')
                                 # Resample the DataFrame (columns are symbols)
                                 resampled_dict[col_name] = data.resample(pandas_freq).apply(rule).dropna()
                             
                             base_df = resampled_dict
                         else:
                             # Single Asset (DataFrame with OHLCV columns)
                             base_df = df.resample(pandas_freq).agg({
                                 'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'
                             }).dropna()
                             
                         # Store in cache
                         self.resampled_cache[cache_key] = base_df
                         
                     except Exception as e:
                         logger.warning(f"MTF Resample Failed: {e}. Using base dataframe.")
                         base_df = df

        # 2. Extract Data Columns
        # Handle Universe (dict) vs Single (DataFrame)
        if isinstance(base_df, dict):
            # Universe Mode: Each value is a DataFrame of symbols
            close = base_df.get('Close')
            high = base_df.get('High', close)
            low = base_df.get('Low', close)
            volume = base_df.get('Volume', None)
            open_p = base_df.get('Open', close)
        else:
            # Single Mode: DataFrame with columns 'Open', 'Close', etc.
            close = base_df['Close']
            high = base_df.get('High', close)
            low = base_df.get('Low', close)
            volume = base_df.get('Volume', None)
            open_p = base_df.get('Open', None)

        period = int(period) if period else 14
        result_series = None

        try:
            if indicator_type == 'RSI':
                result_series = vbt.RSI.run(close, window=period).rsi
            
            elif indicator_type == 'SMA':
                result_series = vbt.MA.run(close, window=period).ma
            
            elif indicator_type == 'EMA':
                result_series = close.ewm(span=period, adjust=False).mean()
            
            elif indicator_type == 'MACD':
                # MACD Line
                result_series = ta.macd(close, fast=12, slow=26, signal=9)['MACD_12_26_9']
            
            elif indicator_type == 'MACD Signal':
                # Signal Line
                result_series = ta.macd(close, fast=12, slow=26, signal=9)['MACDs_12_26_9']
            
            elif indicator_type == 'Bollinger Upper':
                result_series = vbt.BBANDS.run(close, window=period).upper
            
            elif indicator_type == 'Bollinger Lower':
                result_series = vbt.BBANDS.run(close, window=period).lower
            
            elif indicator_type == 'Bollinger Mid':
                result_series = vbt.BBANDS.run(close, window=period).middle
            
            elif indicator_type == 'ATR':
                result_series = vbt.ATR.run(high, low, close, window=period).atr
            
            elif indicator_type == 'Close Price': result_series = close
            elif indicator_type == 'Open Price': result_series = open_p
            elif indicator_type == 'High Price': result_series = high
            elif indicator_type == 'Low Price': result_series = low
            elif indicator_type == 'Volume': result_series = volume if volume is not None else close
            
            else:
                result_series = close
        except Exception as e:
            logger.error(f"Indicator Error ({indicator_type}): {e}")
            result_series = close

        # 3. Post-Process MTF: Reindex back to original timeline
        if timeframe and result_series is not None:
             # We need the original index to broadcast back
             target_index = df['Close'].index if isinstance(df, dict) else df.index
             
             # Reindex and Forward Fill
             # This aligns the 1H indicator value to all 5M bars inside that hour
             result_series = result_series.reindex(target_index).ffill()

        return result_series

    def _evaluate_node(self, df, node):
        """
        Recursively evaluates a RuleGroup or a Condition.
        node: Dict (RuleGroup or Condition)
        """
        # 1. Check if Group
        if node.get('type') == 'GROUP':
            children = node.get('conditions', [])
            if not children:
                return True # Empty group defaults to True

            results = [self._evaluate_node(df, child) for child in children]
            
            # Combine results based on Logic
            final_mask = results[0]
            logic = node.get('logic', 'AND')
            
            for i in range(1, len(results)):
                if logic == 'AND':
                    final_mask = final_mask & results[i]
                else: # OR
                    final_mask = final_mask | results[i]
            return final_mask

        # 2. It's a Condition
        return self._evaluate_condition(df, node)

    def _evaluate_condition(self, df, rule):
        try:
            # Left Series (Supports MTF via rule['timeframe'])
            left = self._get_series(df, rule['indicator'], rule.get('period', 14), rule.get('timeframe'))
            
            # Multiplier (e.g., for ATR bands)
            if rule.get('multiplier'):
                left = left * float(rule['multiplier'])

            # Right Series (Value or Indicator, supports MTF via rule['rightTimeframe'])
            if rule.get('compareType') == 'INDICATOR':
                right = self._get_series(df, rule['rightIndicator'], rule.get('rightPeriod', 14), rule.get('rightTimeframe'))
            else:
                right = float(rule['value'])

            op = rule['operator']
            
            # VectorBT Crossover Logic
            if op == 'Crosses Above':
                return left.vbt.crossed_above(right)
            elif op == 'Crosses Below':
                return left.vbt.crossed_below(right)
            elif op == '>':
                return left > right
            elif op == '<':
                return left < right
            elif op == '=':
                return left == right
            else:
                return False

        except Exception as e:
            logger.error(f"Condition Eval Error: {e}")
            return False

    def _apply_time_filter(self, df, entries, exits):
        """Filters signals based on Start/End time logic"""
        start_time = self.config.get('startTime')
        end_time = self.config.get('endTime')

        if not start_time and not end_time:
            return entries, exits
        
        # Get Index
        target_index = df['Close'].index if isinstance(df, dict) else df.index

        if not isinstance(target_index, pd.DatetimeIndex):
            return entries, exits

        # Create time mask
        time_mask = pd.Series(True, index=target_index)
        
        if start_time and end_time:
            # Keep True only between times
            indexer = target_index.indexer_between_time(start_time, end_time)
            mask_array = np.zeros(len(target_index), dtype=bool)
            mask_array[indexer] = True
            time_mask = pd.Series(mask_array, index=target_index)
        
        # Apply mask
        # If entries is DataFrame (Universe), broadcast the mask
        if isinstance(entries, pd.DataFrame):
            # entries shape: (rows, symbols)
            # time_mask shape: (rows,)
            # We align along axis 0
            entries = entries.multiply(time_mask, axis=0)
            exits = exits.multiply(time_mask, axis=0)
        else:
            entries = entries & time_mask
            exits = exits & time_mask
            
        return entries, exits

    def generate_signals(self, df):
        # 1. CODE MODE CHECK
        if self.config.get('mode') == 'CODE':
            return self._execute_python_code(df)

        # 2. VISUAL MODE
        entry_group = self.config.get('entryLogic')
        exit_group = self.config.get('exitLogic')

        # Get Index for Empty Series creation
        target_index = df['Close'].index if isinstance(df, dict) else df.index
        # Get Shape for broadcasting if Universe
        is_universe = isinstance(df, dict)
        
        if not entry_group:
            if is_universe:
                # Create False DataFrame matching symbols
                entries = pd.DataFrame(False, index=target_index, columns=df['Close'].columns)
            else:
                entries = pd.Series(False, index=target_index)
            exits = entries
        else:
            entries = self._evaluate_node(df, entry_group)
            
            if not exit_group:
                if is_universe:
                    exits = pd.DataFrame(False, index=target_index, columns=df['Close'].columns)
                else:
                    exits = pd.Series(False, index=target_index)
            else:
                exits = self._evaluate_node(df, exit_group)

        # 3. Time Filters
        entries, exits = self._apply_time_filter(df, entries, exits)

        return entries, exits

    def _execute_python_code(self, df):
        """
        Dangerous but Powerful: Execute raw python code for signal generation.
        Expected format:
        def signal_logic(df):
            # ... calculation ...
            return entries, exits
        """
        code = self.config.get('pythonCode', '')
        if not code:
            return None, None
            
        try:
            local_scope = {'df': df, 'vbt': vbt, 'pd': pd, 'np': np, 'ta': ta}
            # WARNING: exec() allows arbitrary code execution. 
            # In a real environment, use a sandbox or RestrictedPython.
            exec(code, globals(), local_scope)
            
            if 'signal_logic' in local_scope:
                return local_scope['signal_logic'](df)
            else:
                logger.error("Python Code must define 'signal_logic(df)' function.")
                return None, None
        except Exception as e:
            logger.error(f"Code Execution Error: {e}")
            return None, None

class StrategyFactory:
    @staticmethod
    def get_strategy(strategy_id, config):
        # If ID is provided as preset, map it, otherwise check for custom config
        if strategy_id == "3": 
            # Convert simple SMA config to Dynamic Config for consistency
            return DynamicStrategy({
                'entryLogic': {
                    'type': 'GROUP', 'logic': 'AND',
                    'conditions': [{
                        'indicator': 'SMA', 'period': config.get('fast', 10), 'operator': 'Crosses Above',
                        'compareType': 'INDICATOR', 'rightIndicator': 'SMA', 'rightPeriod': config.get('slow', 50)
                    }]
                }
            })
        
        # Default handler for Custom Strategy from Builder
        return DynamicStrategy(config)
