
import pandas as pd
import numpy as np
import requests
import yfinance as yf
from datetime import datetime, timedelta
import logging
import vectorbt as vbt
import optuna
from strategies import StrategyFactory

# Set Optuna logging to warning to avoid console spam
optuna.logging.set_verbosity(optuna.logging.WARNING)

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
        tickers = []
        if universe_id == 'NIFTY_50': tickers = ['REL.NS', 'TCS.NS', 'HDFC.NS', 'INFY.NS', 'ICICI.NS']
        elif universe_id == 'BANK_NIFTY': tickers = ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS']
        else: tickers = ['STOCK_A', 'STOCK_B', 'STOCK_C', 'STOCK_D']
        
        logger.info(f"Generating Universe Data for {universe_id} ({len(tickers)} assets)")
        
        periods = 200
        dates = pd.date_range(end=datetime.now(), periods=periods, freq='D')
        
        close_data = {}
        for t in tickers:
            base = 1000 + np.random.randint(0, 500)
            returns = np.random.normal(0.0005, 0.02, periods)
            price = base * (1 + returns).cumprod()
            close_data[t] = price
            
        close_df = pd.DataFrame(close_data, index=dates)
        return {'Close': close_df, 'Volume': close_df * 1000}

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
        
        # CRITICAL FIX: Parse Stop Loss and Take Profit
        sl_pct = float(config.get('stopLossPct', 0)) / 100.0
        tp_pct = float(config.get('takeProfitPct', 0)) / 100.0

        strategy = StrategyFactory.get_strategy(strategy_id, config)
        entries, exits = strategy.generate_signals(df)
        
        # Handle dict-based DF (Universe) vs Standard DF
        if isinstance(df, dict):
            close_price = df['Close']
        else:
            close_price = df['Close']
        
        # Configure VBT Portfolio arguments
        pf_kwargs = {
            'init_cash': initial_capital,
            'fees': fees,
            'slippage': slippage,
            'freq': '1D'
        }
        
        # Apply SL/TP if they exist (VBT handles these as % away from entry)
        if sl_pct > 0: pf_kwargs['sl_stop'] = sl_pct
        if tp_pct > 0: pf_kwargs['tp_stop'] = tp_pct
        
        pf = vbt.Portfolio.from_signals(close_price, entries, exits, **pf_kwargs)

        return BacktestEngine._extract_results(pf)

    @staticmethod
    def _extract_results(pf):
        # Check if result is a Series (Single) or DataFrame (Universe)
        is_universe = isinstance(pf.wrapper.columns, pd.Index) and len(pf.wrapper.columns) > 1
        
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
            trades = [] 
        else:
            stats = pf.stats()
            equity = pf.value()
            dd = pf.drawdown() * 100
            
            equity_curve = [
                {"date": str(d), "value": round(v, 2), "drawdown": round(abs(dd.loc[d]), 2)} 
                for d, v in equity.items()
            ]

            trades = []
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

        return {
            "metrics": metrics,
            "equityCurve": equity_curve,
            "trades": trades[::-1],
            "monthlyReturns": []
        }

class OptimizationEngine:
    @staticmethod
    def run_optuna(symbol, strategy_id, ranges, n_trials=30):
        data_engine = DataEngine({})
        df = data_engine.fetch_historical_data(symbol)
        if df.empty: return {"error": "No data"}

        # Define Objective Function for Optuna
        def objective(trial):
            # Construct config dynamically from ranges
            config = {}
            for param, constraints in ranges.items():
                p_min = int(constraints.get('min', 10))
                p_max = int(constraints.get('max', 50))
                p_step = int(constraints.get('step', 1))
                
                # Optuna suggests a value for this parameter
                config[param] = trial.suggest_int(param, p_min, p_max, step=p_step)
            
            # Run Backtest with this config
            strategy = StrategyFactory.get_strategy(strategy_id, config)
            try:
                entries, exits = strategy.generate_signals(df)
                pf = vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D', fees=0.001)
                
                # Metric to Maximize: Sharpe Ratio
                sharpe = pf.sharpe_ratio()
                return -999 if np.isnan(sharpe) else sharpe
            except Exception as e:
                return -999

        # Run Study
        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=n_trials)

        # Collect Results
        grid_results = []
        for t in study.trials:
            if t.value is None or t.value == -999: continue
            
            # Re-run to get other metrics (Return, DD) 
            # Note: In production, we would cache this to avoid re-running
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
    def run_wfo(symbol, strategy_id, ranges, wfo_config):
        # REAL Walk Forward Optimization
        data_engine = DataEngine({})
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
            # 1. SLICE DATA (Train)
            train_df = df.iloc[current_idx - train_window : current_idx]
            
            # 2. OPTIMIZE on Train Data (Find Best Params)
            # We run a small Optuna study here
            best_params = OptimizationEngine._find_best_params(train_df, strategy_id, ranges)
            
            # 3. SLICE DATA (Test)
            test_df = df.iloc[current_idx : current_idx + test_window]
            
            # 4. VALIDATE on Test Data
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
            # Fast VBT simulation
            return vbt.Portfolio.from_signals(df['Close'], entries, exits, freq='1D').sharpe_ratio()

        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=10) # Small trial count for speed inside WFO loop
        return study.best_params

class MonteCarloEngine:
    @staticmethod
    def run(simulations, vol_mult):
        # Simulate standard random walks for now
        # In a real engine, this would bootstrap historical returns
        paths = []
        for i in range(simulations):
            returns = np.random.normal(0.0005, 0.015 * vol_mult, 100)
            price_path = 100 * (1 + returns).cumprod()
            paths.append({
                "id": i,
                "values": price_path.tolist()
            })
        return paths
