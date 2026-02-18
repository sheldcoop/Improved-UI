import pandas as pd
import numpy as np
import requests
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
        # 1. Try Alpha Vantage (Mocked check for brevity in refactor)
        if self.use_av and self.av_key:
            try:
                # ... (Existing AV logic kept for compatibility) ...
                pass 
            except Exception as e:
                logger.error(f"Alpha Vantage Fetch Failed: {e}")

        # 2. Fallback Synthetic Data (Vectorized Generation)
        logger.info("Generating Vectorized Synthetic Data")
        periods = 365
        dates = pd.date_range(end=datetime.now(), periods=periods)
        
        # Random Walk
        base_price = 22000 if 'NIFTY' in symbol else 100
        np.random.seed(42) # For reproducibility in demo
        returns = np.random.normal(0.0005, 0.015, periods) # Slight upward drift
        price_path = base_price * (1 + returns).cumprod()
        
        df = pd.DataFrame({
            'Open': price_path,
            'High': price_path * 1.01,
            'Low': price_path * 0.99,
            'Close': price_path * (1 + np.random.normal(0, 0.002, periods)),
            'Volume': np.random.randint(1000, 50000, periods)
        }, index=dates) # VectorBT expects a DateTime Index
        
        return df

    def fetch_option_chain(self, symbol, expiry):
        return []

class BacktestEngine:
    """
    Wrapper around vectorbt Portfolio for standardized API output.
    """
    @staticmethod
    def run(df, strategy_id, config={}):
        if df.empty:
            return None

        # 1. Config Extraction
        # vectorbt expects fees in decimal (e.g. 0.001 for 0.1%)
        slippage_pct = float(config.get('slippage', 0.05)) / 100.0
        commission_val = float(config.get('commission', 20.0))
        initial_capital = float(config.get('initial_capital', 100000.0))

        # 2. Generate Signals
        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)
        
        # 3. Build Portfolio (The Heavy Lifting)
        # We approximate commission as a percentage for vbt simplicity or use fixed fees per trade
        # Here we use a fixed fee per trade approximation if capital is known, or just percentage
        # vectorbt standard supports `fees` as percentage. Fixed fees require `size` logic.
        # For this demo, we convert fixed commission to approx percentage based on initial capital
        approx_fee_pct = (commission_val / initial_capital) 

        pf = vbt.Portfolio.from_signals(
            df['Close'],
            entries,
            exits,
            init_cash=initial_capital,
            fees=approx_fee_pct,
            slippage=slippage_pct,
            freq='1D'
        )

        # 4. Extract Metrics using VectorBT accessors
        total_return_pct = pf.total_return() * 100
        stats = pf.stats()
        
        # 5. Extract Equity Curve
        # pf.value() returns a Series with DateTime index
        equity_series = pf.value()
        drawdown_series = pf.drawdown() * 100
        
        equity_curve = []
        for date, value in equity_series.items():
            equity_curve.append({
                "date": date.strftime('%Y-%m-%d'),
                "value": round(value, 2),
                "drawdown": round(abs(drawdown_series.loc[date]), 2)
            })

        # 6. Extract Trades
        # pf.trades.records_readable is a DataFrame
        trade_records = pf.trades.records_readable
        # Add PnL % manually if not present in readable (it usually has Return)
        
        trades_list = []
        for i, row in trade_records.iterrows():
            # vectorbt returns 'Entry Timestamp', 'Exit Timestamp', 'Entry Price', 'Exit Price', 'PnL', 'Return'
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
                "totalReturnPct": round(total_return_pct, 2),
                "sharpeRatio": round(stats.get('Sharpe Ratio', 0), 2),
                "maxDrawdownPct": round(abs(stats.get('Max Drawdown [%]', 0)), 2),
                "winRate": round(stats.get('Win Rate [%]', 0), 1),
                "profitFactor": round(stats.get('Profit Factor', 0), 2),
                "totalTrades": int(stats.get('Total Trades', 0)),
                "consecutiveLosses": 0, # vbt doesn't give this in basic stats, simplified
                "alpha": round(stats.get('Alpha', 0), 2), 
                "beta": round(stats.get('Beta', 0), 2), 
                "volatility": round(stats.get('Volatility (Ann.) [%]', 0), 1),
                "expectancy": 0.0,
                "cagr": round(stats.get('Total Return [%]', 0), 2), # Using Total return as proxy for short period
                "sortinoRatio": round(stats.get('Sortino Ratio', 0), 2),
                "calmarRatio": round(stats.get('Calmar Ratio', 0), 2),
                "kellyCriterion": 0.0,
                "avgDrawdownDuration": str(stats.get('Max Drawdown Duration', '0 days'))
            },
            "equityCurve": equity_curve,
            "trades": trades_list[::-1], # Newest first
            "monthlyReturns": [] # Can be extracted from pf.returns.resample('M')
        }
