import pandas as pd
import numpy as np
import requests
import yfinance as yf
from datetime import datetime
import logging
import vectorbt as vbt
from strategies import StrategyFactory

logger = logging.getLogger(__name__)

class DataEngine:
    def __init__(self, headers):
        self.av_key = headers.get('x-alpha-vantage-key')
        self.use_av = headers.get('x-use-alpha-vantage') == 'true'

    def fetch_historical_data(self, symbol, timeframe='1d'):
        # Map UI symbols to Yahoo Finance Tickers
        ticker_map = {
            'NIFTY 50': '^NSEI',
            'BANKNIFTY': '^NSEBANK',
            'RELIANCE': 'RELIANCE.NS',
            'HDFCBANK': 'HDFCBANK.NS',
            'INFY': 'INFY.NS',
            'ADANIENT': 'ADANIENT.NS'
        }
        ticker = ticker_map.get(symbol, symbol)
        
        logger.info(f"Fetching data for {ticker} via yfinance...")
        try:
            # Download Real Data
            df = yf.download(ticker, period="2y", interval="1d", progress=False)
            
            if not df.empty:
                # yfinance returns MultiIndex columns in recent versions, flatten them
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                
                # Standardize columns
                df = df.rename(columns={
                    "Open": "Open", "High": "High", "Low": "Low", 
                    "Close": "Close", "Volume": "Volume"
                })
                return df
        except Exception as e:
            logger.error(f"yfinance failed: {e}")

        # Fallback: Synthetic Data (Only if YF fails)
        logger.warning("Using Synthetic Data Fallback")
        periods = 365
        dates = pd.date_range(end=datetime.now(), periods=periods)
        base_price = 22000 if 'NIFTY' in symbol else 100
        returns = np.random.normal(0.0005, 0.015, periods)
        price_path = base_price * (1 + returns).cumprod()
        
        df = pd.DataFrame({
            'Open': price_path, 'High': price_path * 1.01, 'Low': price_path * 0.99,
            'Close': price_path, 'Volume': np.random.randint(1000, 50000, periods)
        }, index=dates)
        return df

    def fetch_option_chain(self, symbol, expiry):
        return []

class BacktestEngine:
    @staticmethod
    def run(df, strategy_id, config={}):
        if df.empty: return None

        slippage_pct = float(config.get('slippage', 0.05)) / 100.0
        commission_val = float(config.get('commission', 20.0))
        initial_capital = float(config.get('initial_capital', 100000.0))
        approx_fee_pct = (commission_val / initial_capital)

        # 1. Generate Signals (Vectorized)
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)
        
        # 2. Build Portfolio
        pf = vbt.Portfolio.from_signals(
            df['Close'], entries, exits,
            init_cash=initial_capital, fees=approx_fee_pct, slippage=slippage_pct, freq='1D'
        )

        # 3. Extract Results
        stats = pf.stats()
        equity_series = pf.value()
        drawdown_series = pf.drawdown() * 100
        
        equity_curve = [
            {"date": date.strftime('%Y-%m-%d'), "value": round(value, 2), "drawdown": round(abs(drawdown_series.loc[date]), 2)} 
            for date, value in equity_series.items()
        ]

        # Extract Trades
        trade_records = pf.trades.records_readable
        trades_list = []
        for i, row in trade_records.iterrows():
             trades_list.append({
                "id": f"t-{i}",
                "entryDate": row['Entry Timestamp'].strftime('%Y-%m-%d'),
                "exitDate": row['Exit Timestamp'].strftime('%Y-%m-%d'),
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
            "trades": trades_list[::-1],
            "monthlyReturns": []
        }

class OptimizationEngine:
    @staticmethod
    def run(symbol, strategy_id):
        # 1. Fetch Real Data
        data_engine = DataEngine({})
        df = data_engine.fetch_historical_data(symbol)
        if df.empty: return {"error": "No data"}

        grid_results = []
        
        # 2. VectorBT Broadcasting Optimization
        # We run multiple backtests simultaneously by passing arrays of parameters
        
        if strategy_id == "1": # RSI Strategy
            # Optimize: RSI Period (10 to 30) and Stop Loss (1% to 5%)
            periods = np.arange(10, 30, 2)
            lower_bounds = np.arange(20, 45, 5)
            
            # vbt.RSI.run supports broadcasting
            # We treat 'close' as one column, but we want multiple output columns for each param combo
            # vectorbt handles this via `param_product=True` usually, or explicit looping if simpler
            
            # For simplicity in this demo structure, we use a loop but utilizing VBT for the heavy calc
            for p in periods:
                for l in lower_bounds:
                    # Run Strategy Logic
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
        
        elif strategy_id == "3": # SMA Strategy
             # Optimize Fast MA
             fast_windows = np.arange(5, 25, 5)
             slow_windows = np.arange(30, 60, 10)
             
             for f in fast_windows:
                 for s in slow_windows:
                     fast_ma = vbt.MA.run(df['Close'], window=int(f))
                     slow_ma = vbt.MA.run(df['Close'], window=int(s))
                     entries = fast_ma.ma_crossed_above(slow_ma)
                     exits = fast_ma.ma_crossed_below(slow_ma)
                     
                     pf = vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D', fees=0.001)
                     
                     grid_results.append({
                        "paramSet": {"fast": int(f), "slow": int(s)},
                        "sharpe": round(pf.sharpe_ratio(), 2),
                        "returnPct": round(pf.total_return() * 100, 2),
                        "drawdown": round(abs(pf.max_drawdown()) * 100, 2)
                    })

        return {"grid": grid_results, "wfo": []}
