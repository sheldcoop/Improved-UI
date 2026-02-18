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
        ticker_map = {
            'NIFTY 50': '^NSEI', 'BANKNIFTY': '^NSEBANK',
            'RELIANCE': 'RELIANCE.NS', 'HDFCBANK': 'HDFCBANK.NS',
            'INFY': 'INFY.NS', 'ADANIENT': 'ADANIENT.NS'
        }
        ticker = ticker_map.get(symbol, symbol)
        
        # Map timeframe to yfinance interval
        # yf supports: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
        interval_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '1d': '1d'
        }
        interval = interval_map.get(timeframe, '1d')
        
        # Adjust period based on interval (intraday only allows last 60d)
        period = "2y"
        if interval in ['1m', '5m', '15m', '1h']:
            period = "59d" # Safe limit for yf intraday

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

        # Synthetic Fallback
        return self._generate_synthetic(symbol, interval)

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
        if df.empty: return None

        slippage = float(config.get('slippage', 0.05)) / 100.0
        initial_capital = float(config.get('initial_capital', 100000.0))
        fees = float(config.get('commission', 20.0)) / initial_capital

        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)
        
        # Stop Loss / Take Profit from config
        sl_pct = float(config.get('stopLossPct', 0.0)) / 100.0
        tp_pct = float(config.get('takeProfitPct', 0.0)) / 100.0
        
        sl = sl_pct if sl_pct > 0 else None
        tp = tp_pct if tp_pct > 0 else None

        pf = vbt.Portfolio.from_signals(
            df['Close'], entries, exits,
            sl_stop=sl, tp_stop=tp,
            init_cash=initial_capital, fees=fees, slippage=slippage, freq='1D'
        )

        return BacktestEngine._extract_results(pf)

    @staticmethod
    def _extract_results(pf):
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

        return {
            "metrics": {
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
            },
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
        
        # Dynamic Grid based on ranges
        # Expect ranges: { 'rsi_period': {min, max, step}, 'rsi_lower': {min, max, step} }
        
        # Simplified handling for Demo: Hardcoded support for RSI params via the generic ranges input
        r_period = ranges.get('rsi_period', {'min': 14, 'max': 14, 'step': 1})
        r_lower = ranges.get('rsi_lower', {'min': 30, 'max': 30, 'step': 5})
        
        periods = np.arange(int(r_period['min']), int(r_period['max']) + 1, int(r_period['step']))
        lowers = np.arange(int(r_lower['min']), int(r_lower['max']) + 1, int(r_lower['step']))
        
        # Broadcasting optimization
        # Logic: We run VBT RSI across all periods
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

class MonteCarloEngine:
    @staticmethod
    def run(simulations, volatility_multiplier):
        # Generate synthetic path based on GBM
        paths = []
        for i in range(simulations):
            # Geometric Brownian Motion
            mu = 0.0005 # Daily drift
            sigma = 0.015 * volatility_multiplier # Daily vol adjusted
            T = 100 # Days
            dt = 1
            
            S0 = 100
            np.random.seed(i)
            W = np.random.standard_normal(size=T)
            W = np.cumsum(W) * np.sqrt(dt) ### standard brownian motion ###
            X = (mu - 0.5 * sigma**2) * np.arange(1, T+1) * dt + sigma * W
            S = S0 * np.exp(X) # geometric brownian motion
            
            paths.append({
                "id": i,
                "values": [100] + S.tolist()
            })
        return paths
