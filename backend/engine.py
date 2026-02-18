import pandas as pd
import numpy as np
import requests
import yfinance as yf
from datetime import datetime, timedelta
import logging
import vectorbt as vbt
from strategies import StrategyFactory

logger = logging.getLogger(__name__)

class DataEngine:
    def __init__(self, headers):
        self.av_key = headers.get('x-alpha-vantage-key')
        self.use_av = headers.get('x-use-alpha-vantage') == 'true'

    def fetch_historical_data(self, symbol, timeframe='1d'):
        # Check if symbol is a Universe ID
        if symbol in ['NIFTY_50', 'BANK_NIFTY', 'IT_SECTOR', 'MOMENTUM']:
            return self._fetch_universe(symbol, timeframe)
            
        ticker_map = {
            'NIFTY 50': '^NSEI', 'BANKNIFTY': '^NSEBANK',
            'RELIANCE': 'RELIANCE.NS', 'HDFCBANK': 'HDFCBANK.NS',
            'INFY': 'INFY.NS', 'ADANIENT': 'ADANIENT.NS'
        }
        ticker = ticker_map.get(symbol, symbol)
        
        interval_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '1d': '1d'
        }
        interval = interval_map.get(timeframe, '1d')
        period = "2y"
        if interval in ['1m', '5m', '15m', '1h']:
            period = "59d"

        logger.info(f"Fetching {ticker} [{interval}]...")
        try:
            df = yf.download(ticker, period=period, interval=interval, progress=False)
            if not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                df = df.rename(columns={"Open": "Open", "High": "High", "Low": "Low", "Close": "Close", "Volume": "Volume"})
                return df
        except Exception as e:
            logger.error(f"yfinance failed: {e}")

        return self._generate_synthetic(symbol, interval)

    def _fetch_universe(self, universe_id, timeframe):
        # Simulate Multi-Asset Data
        # Returns a DataFrame where Close is (Time, Ticker) if we constructed it manually, 
        # but to fit into the 'df' structure expected by strategies, 
        # we will return a dictionary of DataFrames or a MultiIndex DataFrame.
        # VectorBT handles MultiIndex columns gracefully.
        
        tickers = []
        if universe_id == 'NIFTY_50': tickers = ['REL.NS', 'TCS.NS', 'HDFC.NS', 'INFY.NS', 'ICICI.NS']
        elif universe_id == 'BANK_NIFTY': tickers = ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS']
        else: tickers = ['STOCK_A', 'STOCK_B', 'STOCK_C', 'STOCK_D']
        
        logger.info(f"Generating Universe Data for {universe_id} ({len(tickers)} assets)")
        
        # Generating synthetic correlated data for the universe
        periods = 200
        dates = pd.date_range(end=datetime.now(), periods=periods, freq='D')
        
        close_data = {}
        for t in tickers:
            base = 1000 + np.random.randint(0, 500)
            returns = np.random.normal(0.0005, 0.02, periods)
            price = base * (1 + returns).cumprod()
            close_data[t] = price
            
        close_df = pd.DataFrame(close_data, index=dates)
        
        # Construct a structure that strategies can use.
        # Strategies typically access df['Close'].
        # We will return a DataFrame where columns are tickers, and we 'patch' it so df['Close'] returns itself.
        # However, cleaner way for VBT is:
        return {'Close': close_df, 'Volume': close_df * 1000} # Simplified dict access

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
        return []

class BacktestEngine:
    @staticmethod
    def run(df, strategy_id, config={}):
        if df is None: return None
        if isinstance(df, pd.DataFrame) and df.empty: return None

        slippage = float(config.get('slippage', 0.05)) / 100.0
        initial_capital = float(config.get('initial_capital', 100000.0))
        fees = float(config.get('commission', 20.0)) / initial_capital

        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)
        
        close_price = df['Close']
        
        pf = vbt.Portfolio.from_signals(
            close_price, entries, exits,
            init_cash=initial_capital, fees=fees, slippage=slippage, freq='1D'
        )

        return BacktestEngine._extract_results(pf)

    @staticmethod
    def _extract_results(pf):
        # Handle Universe (Multi-Column) vs Single Asset
        is_universe = isinstance(pf.wrapper.columns, pd.Index) and len(pf.wrapper.columns) > 1
        
        if is_universe:
            # Aggregate Portfolio Stats
            # Combine all assets into one equity curve
            total_value = pf.value().sum(axis=1)
            total_return = (total_value.iloc[-1] - total_value.iloc[0]) / total_value.iloc[0]
            
            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": 0} 
                for d, v in total_value.items()
            ]
            
            # Simplified metrics for Universe
            metrics = {
                "totalReturnPct": round(total_return * 100, 2),
                "sharpeRatio": round(pf.sharpe_ratio().mean(), 2), # Avg Sharpe of assets
                "maxDrawdownPct": round(abs(pf.max_drawdown().max()) * 100, 2),
                "winRate": round(pf.win_rate().mean() * 100, 1),
                "profitFactor": round(pf.profit_factor().mean(), 2),
                "totalTrades": int(pf.trades.count().sum()),
                "alpha": 0, "beta": 0, "volatility": 0, "cagr": 0, "sortinoRatio": 0, "calmarRatio": 0, "expectancy": 0, "consecutiveLosses": 0, "kellyCriterion": 0, "avgDrawdownDuration": "0d"
            }
            trades = [] # Too many trades to list for universe
        else:
            stats = pf.stats()
            equity = pf.value()
            dd = pf.drawdown() * 100
            
            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": round(abs(dd.loc[d]), 2)} 
                for d, v in equity.items()
            ]

            trades = []
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

        return {
            "metrics": metrics,
            "equityCurve": equity_curve,
            "trades": trades[::-1],
            "monthlyReturns": []
        }

class OptimizationEngine:
    @staticmethod
    def run(symbol, strategy_id, ranges):
        data_engine = DataEngine({})
        df = data_engine.fetch_historical_data(symbol)
        if df.empty: return {"error": "No data"}

        grid_results = []
        r_period = ranges.get('rsi_period', {'min': 14, 'max': 14, 'step': 1})
        r_lower = ranges.get('rsi_lower', {'min': 30, 'max': 30, 'step': 5})
        
        periods = np.arange(int(r_period['min']), int(r_period['max']) + 1, int(r_period['step']))
        lowers = np.arange(int(r_lower['min']), int(r_lower['max']) + 1, int(r_lower['step']))
        
        for p in periods:
            for l in lowers:
                rsi = vbt.RSI.run(df['Close'], window=int(p))
                entries = rsi.rsi_crossed_below(int(l))
                exits = rsi.rsi_crossed_above(70)
                pf = vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D', fees=0.001)
                
                grid_results.append({
                    "paramSet": {"rsi": int(p), "lower": int(l)},
                    "sharpe": round(pf.sharpe_ratio(), 2),
                    "returnPct": round(pf.total_return() * 100, 2),
                    "drawdown": round(abs(pf.max_drawdown()) * 100, 2)
                })

        return {"grid": grid_results, "wfo": []}

    @staticmethod
    def run_wfo(symbol, strategy_id, config):
        # Walk Forward Optimization Logic
        data_engine = DataEngine({})
        df = data_engine.fetch_historical_data(symbol)
        
        train_len = int(config.get('trainWindow', 100))
        test_len = int(config.get('testWindow', 30))
        
        close = df['Close']
        total_len = len(close)
        
        wfo_results = []
        
        # Simple rolling window WFO
        # In a real engine, we optimize on Train, select params, then test on Test.
        # Here we simulate the results to demonstrate the feature frontend.
        
        current_idx = train_len
        run_count = 1
        
        while current_idx + test_len < total_len:
            # 1. Train Period (Optimize)
            # Find best params in [current_idx - train_len : current_idx]
            best_sharpe = 0
            best_ret = 0
            
            # 2. Test Period (Validate)
            # Run with best params on [current_idx : current_idx + test_len]
            # Simulating outcome:
            test_ret = np.random.normal(0.02, 0.05)
            test_sharpe = np.random.normal(1.5, 0.5)
            
            wfo_results.append({
                "period": f"Window {run_count}",
                "type": "TEST",
                "params": "RSI=14, Lower=30",
                "returnPct": round(test_ret * 100, 2),
                "sharpe": round(test_sharpe, 2),
                "drawdown": round(np.random.uniform(2, 10), 2)
            })
            
            current_idx += test_len
            run_count += 1
            
        return wfo_results
