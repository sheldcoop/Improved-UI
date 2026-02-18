import { BacktestResult, Strategy, Timeframe, AssetClass, IndicatorType, Operator, OptimizationResult, WFOResult, MonteCarloPath, Trade } from '../types';
import { API_ENDPOINTS, CONFIG } from '../config';
import { executeWithFallback, delay } from './http';

// --- MOCKS ---
let mockStrategies: Strategy[] = [
  {
    id: '1',
    name: 'RSI Mean Reversion',
    description: 'Buy when RSI < 30, Sell when RSI > 70',
    assetClass: AssetClass.EQUITY,
    timeframe: Timeframe.D1,
    entryRules: [{ id: 'c1', indicator: IndicatorType.RSI, period: 14, operator: Operator.LESS_THAN, value: 30 }],
    exitRules: [{ id: 'c2', indicator: IndicatorType.RSI, period: 14, operator: Operator.GREATER_THAN, value: 70 }],
    stopLossPct: 2.0,
    takeProfitPct: 5.0,
    created: '2024-01-15'
  }
];

export const fetchStrategies = async (): Promise<Strategy[]> => {
  return executeWithFallback(API_ENDPOINTS.STRATEGIES, undefined, async () => {
      await delay(CONFIG.MOCK_DELAY_MS);
      return [...mockStrategies];
  });
};

export const saveStrategy = async (strategy: Strategy): Promise<void> => {
    return executeWithFallback(API_ENDPOINTS.STRATEGIES, { method: 'POST', body: JSON.stringify(strategy) }, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
        const existingIndex = mockStrategies.findIndex(s => s.id === strategy.id);
        if (existingIndex >= 0) mockStrategies[existingIndex] = strategy;
        else mockStrategies.push(strategy);
    });
};

export const runBacktest = async (strategyId: string, symbol: string): Promise<BacktestResult> => {
  return executeWithFallback(API_ENDPOINTS.BACKTEST, { method: 'POST', body: JSON.stringify({ strategyId, symbol }) }, async () => {
      await delay(1500); 
      // Mock Backtest Logic
      const trades: Trade[] = [];
      const equityCurve = [];
      let value = 100000;
      let peak = 100000;
      const startDate = new Date('2023-01-01');

      for (let i = 0; i < 250; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dailyReturn = (Math.random() - 0.48) * 0.02;
        value += value * dailyReturn;
        if (value > peak) peak = value;
        
        equityCurve.push({
          date: dateStr,
          value: Number(value.toFixed(2)),
          drawdown: peak > 0 ? Number((((peak - value) / peak) * 100).toFixed(2)) : 0
        });

        if (Math.random() > 0.8) {
            trades.push({
                id: `t-${i}`,
                entryDate: dateStr,
                exitDate: dateStr,
                side: Math.random() > 0.5 ? 'LONG' : 'SHORT',
                entryPrice: 100,
                exitPrice: 102,
                pnl: 200,
                pnlPct: 2.0,
                status: 'WIN'
            });
        }
      }

      return {
        id: Math.random().toString(),
        strategyName: 'Mock Strategy',
        symbol,
        timeframe: Timeframe.D1,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        metrics: {
          totalReturnPct: Number(((value - 100000)/1000).toFixed(2)),
          cagr: 12.5, sharpeRatio: 1.8, sortinoRatio: 2.1, calmarRatio: 1.5,
          maxDrawdownPct: 12.0, avgDrawdownDuration: '15 days', winRate: 60,
          profitFactor: 1.6, kellyCriterion: 0.1, totalTrades: trades.length,
          consecutiveLosses: 3, alpha: 0.05, beta: 0.9, volatility: 14, expectancy: 0.4
        },
        monthlyReturns: [],
        equityCurve,
        trades,
        status: 'completed'
      };
  });
};

export const runOptimization = async (): Promise<{ grid: OptimizationResult[], wfo: WFOResult[] }> => {
    return executeWithFallback(API_ENDPOINTS.OPTIMIZATION, undefined, async () => {
        await delay(1000);
        return { 
            grid: [{ paramSet: { rsi: 14, sl: 2 }, sharpe: 1.5, returnPct: 12, drawdown: 5 }], 
            wfo: [] 
        };
    });
};

export const runMonteCarlo = async (simulations: number = 100): Promise<MonteCarloPath[]> => {
    return executeWithFallback(API_ENDPOINTS.MONTE_CARLO, { method: 'POST', body: JSON.stringify({ simulations }) }, async () => {
        await delay(1000);
        return Array.from({length: simulations}, (_, i) => ({ id: i, values: [100, 101, 99, 102] }));
    });
};
