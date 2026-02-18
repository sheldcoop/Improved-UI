
import pandas as pd
import numpy as np
import requests
import yfinance as yf
from datetime import datetime, timedelta
import logging
import vectorbt as vbt
import optuna
from strategies import StrategyFactory
import io
import os
from diskcache import Cache

# Set Optuna logging to warning to avoid console spam
optuna.logging.set_verbosity(optuna.logging.WARNING)

logger = logging.getLogger(__name__)

# --- CACHE SETUP ---
# Cache data for 1 day to respect API limits and improve speed
cache = Cache('./cache_dir')

class DataEngine:
    def __init__(self, headers):
        self.av_key = headers.get('x-alpha-vantage-key')
        self.use_av = headers.get('x-use-alpha-vantage') == 'true'

    def fetch_historical_data(self, symbol, timeframe='1d'):
        # Create a unique cache key
        cache_key = f"{symbol}_{timeframe}_{'AV' if self.use_av else 'YF'}"
        
        # 1. Check Cache
        cached_df = cache.get(cache_key)
        if cached_df is not None:
            logger.info(f"⚡ Cache Hit for {symbol} [{timeframe}]")
            return cached_df

        # 2. Fetch Data (if not cached)
        df = self._fetch_live(symbol, timeframe)
        
        # 3. Store in Cache (Expire in 24 hours)
        if df is not None and not df.empty:
            cache.set(cache_key, df, expire=86400)
            
        return df

    def _fetch_live(self, symbol, timeframe):
        # 1. Handle Synthetic/Universe IDs
        if symbol in ['NIFTY_50', 'BANK_NIFTY', 'IT_SECTOR', 'MOMENTUM']:
            return self._fetch_universe(symbol, timeframe)
            
        ticker_map = {
            'NIFTY 50': '^NSEI', 'BANKNIFTY': '^NSEBANK',
            'RELIANCE': 'RELIANCE.NS', 'HDFCBANK': 'HDFCBANK.NS',
            'INFY': 'INFY.NS', 'ADANIENT': 'ADANIENT.NS'
        }
        ticker = ticker_map.get(symbol, symbol)
        
        # 2. Try AlphaVantage if Enabled
        if self.use_av and self.av_key:
            logger.info(f"Fetching {symbol} via AlphaVantage...")
            try:
                # Map timeframe to AV functions
                function = 'TIME_SERIES_INTRADAY' if timeframe in ['1m', '5m', '15m', '1h'] else 'TIME_SERIES_DAILY'
                interval_param = f"&interval={timeframe}" if function == 'TIME_SERIES_INTRADAY' else ""
                
                url = f"https://www.alphavantage.co/query?function={function}&symbol={symbol}&apikey={self.av_key}&datatype=csv{interval_param}"
                df = pd.read_csv(url)
                
                # Standardize Columns
                df = df.rename(columns={
                    'timestamp': 'Date', 'time': 'Date',
                    'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'
                })
                df['Date'] = pd.to_datetime(df['Date'])
                df = df.set_index('Date').sort_index()
                
                if not df.empty:
                    return df
            except Exception as e:
                logger.error(f"AlphaVantage failed: {e}. Falling back to YFinance.")

        # 3. Fallback to YFinance
        interval_map = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '1d': '1d' }
        interval = interval_map.get(timeframe, '1d')
        period = "59d" if interval in ['1m', '5m', '15m', '1h'] else "2y"

        logger.info(f"Fetching {ticker} via YFinance [{interval}]...")
        try:
            df = yf.download(ticker, period=period, interval=interval, progress=False)
            if not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                df = df.rename(columns={"Open": "Open", "High": "High", "Low": "Low", "Close": "Close", "Volume": "Volume"})
                return df
        except Exception as e:
            logger.error(f"yfinance failed: {e}")

        # 4. Final Fallback: Synthetic
        return self._generate_synthetic(symbol, interval)

    def _fetch_universe(self, universe_id, timeframe):
        # Simulate Multi-Asset Data
        tickers = []
        if universe_id == 'NIFTY_50': tickers = ['REL.NS', 'TCS.NS', 'HDFC.NS', 'INFY.NS', 'ICICI.NS', 'AXIS.NS', 'SBIN.NS']
        elif universe_id == 'BANK_NIFTY': tickers = ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS']
        else: tickers = ['STOCK_A', 'STOCK_B', 'STOCK_C', 'STOCK_D']
        
        logger.info(f"Generating Universe Data for {universe_id} ({len(tickers)} assets)")
        
        periods = 200
        dates = pd.date_range(end=datetime.now(), periods=periods, freq='D')
        
        close_data = {}
        open_data = {}
        high_data = {}
        low_data = {}
        volume_data = {}
        
        for t in tickers:
            base = 1000 + np.random.randint(0, 500)
            returns = np.random.normal(0.0005, 0.02, periods)
            price = base * (1 + returns).cumprod()
            close_data[t] = price
            open_data[t] = price # Simplified
            high_data[t] = price * 1.01
            low_data[t] = price * 0.99
            volume_data[t] = np.random.randint(1000, 50000, periods)
            
        # Return as a dictionary of DataFrames (VBT friendly structure for indicators)
        return {
            'Open': pd.DataFrame(open_data, index=dates),
            'High': pd.DataFrame(high_data, index=dates),
            'Low': pd.DataFrame(low_data, index=dates),
            'Close': pd.DataFrame(close_data, index=dates),
            'Volume': pd.DataFrame(volume_data, index=dates)
        }

    def _generate_synthetic(self, symbol, interval):
        periods = 200 if interval == '1d' else 1000
        freq = interval if interval != '1d' else 'D'
        if freq == '1m': freq = 'T'
        
        dates = pd.date_range(end=datetime.now(), periods=periods, freq=freq)
        base_price = 22000 if 'NIFTY' in symbol else 100
        returns = np.random.normal(0.0005, 0.015, periods)
        price_path = base_price * (1 + returns).cumprod()
        
        return pd.DataFrame({
            'Open': price_path, 'High': price_path * 1.01, 'Low': price_path * 0.99,
            'Close': price_path, 'Volume': np.random.randint(1000, 50000, periods)
        }, index=dates)

    def fetch_option_chain(self, symbol, expiry):
        # In a production app, this would hit a broker API
        return []

class BacktestEngine:
    @staticmethod
    def run(df, strategy_id, config={}):
        if df is None: return None
        if isinstance(df, pd.DataFrame) and df.empty: return None

        # --- 1. CONFIGURATION ---
        slippage = float(config.get('slippage', 0.05)) / 100.0
        initial_capital = float(config.get('initial_capital', 100000.0))
        fees = float(config.get('commission', 20.0)) / initial_capital
        
        sl_pct = float(config.get('stopLossPct', 0)) / 100.0
        tp_pct = float(config.get('takeProfitPct', 0)) / 100.0
        use_trailing = config.get('useTrailingStop', False)
        
        # Pyramiding
        pyramiding = int(config.get('pyramiding', 1))
        accumulate = True if pyramiding > 1 else False

        # --- 2. GENERATE SIGNALS ---
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)
        
        close_price = df['Close']
        
        # --- 3. UNIVERSE RANKING ---
        entries = BacktestEngine._apply_ranking(entries, df, config)

        # --- 4. POSITION SIZING ---
        size, size_type = BacktestEngine._calculate_sizing(config)

        # --- 5. EXECUTION ---
        pf_kwargs = {
            'init_cash': initial_capital,
            'fees': fees,
            'slippage': slippage,
            'freq': '1D',
            'size': size,
            'size_type': size_type,
            'accumulate': accumulate
        }
        
        if sl_pct > 0: 
            pf_kwargs['sl_stop'] = sl_pct
            pf_kwargs['sl_trail'] = use_trailing
            
        if tp_pct > 0: 
            pf_kwargs['tp_stop'] = tp_pct
        
        try:
            pf = vbt.Portfolio.from_signals(close_price, entries, exits, **pf_kwargs)
            return BacktestEngine._extract_results(pf)
        except Exception as e:
            logger.error(f"VBT Execution Error: {e}")
            return None
            
    @staticmethod
    def _apply_ranking(entries, df, config):
        """Applies Universe Ranking logic (e.g. Top 5 by ROC)"""
        ranking_method = config.get('rankingMethod', 'No Ranking')
        top_n = int(config.get('rankingTopN', 5))
        close_price = df['Close']
        
        if isinstance(close_price, pd.DataFrame) and ranking_method != 'No Ranking' and len(close_price.columns) > top_n:
            logger.info(f"Applying Ranking: {ranking_method}, Top {top_n}")
            
            rank_metric = None
            if ranking_method == 'Rate of Change':
                rank_metric = close_price.pct_change(20)
            elif ranking_method == 'Relative Strength':
                rank_metric = vbt.RSI.run(close_price, window=14).rsi
            elif ranking_method == 'Volatility':
                rank_metric = close_price.pct_change().rolling(20).std()
            elif ranking_method == 'Volume':
                rank_metric = df['Volume'].rolling(20).mean()

            if rank_metric is not None:
                # Rank descending (Top values get rank 1)
                rank_obj = rank_metric.rank(axis=1, ascending=False, pct=False)
                top_mask = rank_obj <= top_n
                return entries & top_mask
        
        return entries

    @staticmethod
    def _calculate_sizing(config):
        """Determines position sizing parameters for VectorBT"""
        sizing_mode = config.get('positionSizing', 'Fixed Capital')
        size_val = float(config.get('positionSizeValue', 100000))

        if sizing_mode == 'Fixed Capital':
            return size_val, 'value'
        elif sizing_mode == '% of Equity':
            return size_val / 100.0, 'percent'
        elif sizing_mode == 'Risk Based (ATR)':
            # Placeholder for complex ATR risk sizing
            return 0.05, 'percent'
        
        return np.inf, 'amount'

    @staticmethod
    def _extract_results(pf):
        # Check if result is a Series (Single) or DataFrame (Universe)
        is_universe = isinstance(pf.wrapper.columns, pd.Index) and len(pf.wrapper.columns) > 1
        
        metrics = {}
        trades = []
        equity_curve = []
        monthly_returns_data = []

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
                "alpha": 0, "beta": 0, "volatility": 0, "cagr": 0, "sortinoRatio": 0, "calmarRatio": 0, "expectancy": 0, "consecutiveLosses": 0, "kellyCriterion": 0, "avgDrawdownDuration": "0d"
            }
        else:
            stats = pf.stats()
            equity = pf.value()
            dd = pf.drawdown() * 100
            
            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": round(abs(dd.loc[d]), 2)} 
                for d, v in equity.items()
            ]

            if hasattr(pf.trades, 'records_readable'):
                for i, row in pf.trades.records_readable.iterrows():
                    trades.append({
                        "id": f"t-{i}",
                        "entryDate": str(row['Entry Timestamp']),
                        "exitDate": str(row['Exit Timestamp']),
                        "side": "LONG" if row['Direction'] == 'Long' else "SHORT",
                        "entryPrice": round(row['Entry Price'], 2),
                        "exitPrice": round(row['Exit Price'], 2),
                        "pnl": round(row['PnL'], 2),
                        "pnlPct": round(row['Return'] * 100, 2),
                        "status": "WIN" if row['PnL'] > 0 else "LOSS"
                    })
            
            metrics = {
                "totalReturnPct": round(pf.total_return() * 100, 2),
                "sharpeRatio": round(stats.get('Sharpe Ratio', 0), 2),
                "maxDrawdownPct": round(abs(stats.get('Max Drawdown [%]', 0)), 2),
                "winRate": round(stats.get('Win Rate [%]', 0), 1),
                "profitFactor": round(stats.get('Profit Factor', 0), 2),
                "totalTrades": int(stats.get('Total Trades', 0)),
                "alpha": round(stats.get('Alpha', 0), 2), 
                "beta": round(stats.get('Beta', 0), 2), 
                "volatility": round(stats.get('Volatility (Ann.) [%]', 0), 1),
                "cagr": round(stats.get('Total Return [%]', 0), 2),
                "sortinoRatio": round(stats.get('Sortino Ratio', 0), 2),
                "calmarRatio": round(stats.get('Calmar Ratio', 0), 2),
                "expectancy": 0.0, "consecutiveLosses": 0, "kellyCriterion": 0.0, "avgDrawdownDuration": "0d"
            }

            # --- MONTHLY RETURNS ---
            try:
                # Resample daily returns to monthly geometric returns
                monthly_resampled = pf.returns.resample('M').apply(lambda x: (1 + x).prod() - 1)
                
                for date, ret in monthly_resampled.items():
                    monthly_returns_data.append({
                        "year": date.year,
                        # Javascript uses 0-11 for months, Python uses 1-12
                        "month": date.month - 1, 
                        "returnPct": round(ret * 100, 2)
                    })
            except Exception as e:
                logger.warning(f"Failed to calc monthly returns: {e}")

        return {
            "metrics": metrics,
            "equityCurve": equity_curve,
            "trades": trades[::-1],
            "monthlyReturns": monthly_returns_data
        }

class OptimizationEngine:
    @staticmethod
    def run_optuna(symbol, strategy_id, ranges, headers, n_trials=30):
        # Fix: Pass headers to DataEngine to ensure API Key usage
        data_engine = DataEngine(headers)
        df = data_engine.fetch_historical_data(symbol)
        if df.empty: return {"error": "No data"}

        def objective(trial):
            config = {}
            for param, constraints in ranges.items():
                p_min = int(constraints.get('min', 10))
                p_max = int(constraints.get('max', 50))
                p_step = int(constraints.get('step', 1))
                config[param] = trial.suggest_int(param, p_min, p_max, step=p_step)
            
            strategy = StrategyFactory.get_strategy(strategy_id, config)
            try:
                entries, exits = strategy.generate_signals(df)
                pf = vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D', fees=0.001)
                sharpe = pf.sharpe_ratio()
                return -999 if np.isnan(sharpe) else sharpe
            except Exception as e:
                return -999

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=n_trials)

        grid_results = []
        for t in study.trials:
            if t.value is None or t.value == -999: continue
            
            config = t.params
            strategy = StrategyFactory.get_strategy(strategy_id, config)
            entries, exits = strategy.generate_signals(df)
            pf = vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D', fees=0.001)
            
            grid_results.append({
                "paramSet": t.params,
                "sharpe": round(pf.sharpe_ratio(), 2),
                "returnPct": round(pf.total_return() * 100, 2),
                "drawdown": round(abs(pf.max_drawdown()) * 100, 2)
            })

        return {"grid": grid_results, "wfo": []}

    @staticmethod
    def run_wfo(symbol, strategy_id, ranges, wfo_config, headers):
        # Fix: Pass headers to DataEngine
        data_engine = DataEngine(headers)
        df = data_engine.fetch_historical_data(symbol)
        
        train_window = int(wfo_config.get('trainWindow', 100))
        test_window = int(wfo_config.get('testWindow', 30))
        
        total_len = len(df)
        if total_len < train_window + test_window:
            return {"error": "Not enough data for WFO"}

        wfo_results = []
        current_idx = train_window
        run_count = 1
        
        while current_idx + test_window <= total_len:
            train_df = df.iloc[current_idx - train_window : current_idx]
            best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges)
            
            test_df = df.iloc[current_idx : current_idx + test_window]
            
            strategy = StrategyFactory.get_strategy(strategy_id, best_params)
            entries, exits = strategy.generate_signals(test_df)
            pf = vbt.Portfolio.from_signals(test_df['Close'], entries, exits, freq='1D', fees=0.001)
            
            wfo_results.append({
                "period": f"Window {run_count}",
                "type": "TEST",
                "params": str(best_params),
                "returnPct": round(pf.total_return() * 100, 2),
                "sharpe": round(pf.sharpe_ratio(), 2),
                "drawdown": round(abs(pf.max_drawdown()) * 100, 2)
            })
            
            current_idx += test_window
            run_count += 1
            
        return wfo_results

    @staticmethod
    def _find_best_params(df, strategy_id, ranges):
        def objective(trial):
            config = {}
            for param, constraints in ranges.items():
                p_min = int(constraints.get('min'))
                p_max = int(constraints.get('max'))
                p_step = int(constraints.get('step'))
                config[param] = trial.suggest_int(param, p_min, p_max, step=p_step)
            
            strategy = StrategyFactory.get_strategy(strategy_id, config)
            entries, exits = strategy.generate_signals(df)
            return vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D').sharpe_ratio()

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=10) 
        return study.best_params

class MonteCarloEngine:
    @staticmethod
    def run(simulations, vol_mult, headers):
        # Fix: Pass headers to DataEngine
        data_engine = DataEngine(headers)
        df = data_engine.fetch_historical_data('NIFTY 50')
        
        if df is None or df.empty:
            mu, sigma = 0.0005, 0.015
            last_price = 100
        else:
            returns = df['Close'].pct_change().dropna()
            mu = returns.mean()
            sigma = returns.std()
            last_price = df['Close'].iloc[-1]
            
        sigma = sigma * vol_mult
        
        paths = []
        days = 252 
        
        for i in range(simulations):
            shocks = np.random.normal(mu, sigma, days)
            price_path = np.zeros(days)
            price_path[0] = last_price
            
            for t in range(1, days):
                price_path[t] = price_path[t-1] * (1 + shocks[t])
                
            paths.append({
                "id": i,
                "values": price_path.tolist()
            })
            
        return paths
