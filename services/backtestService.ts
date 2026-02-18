
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

export interface BacktestConfig {
    slippage?: number;
    commission?: number;
    capital?: number;
    entryRules?: any[];
    exitRules?: any[];
    stopLossPct?: number;
    takeProfitPct?: number;
    strategyName?: string;
}

export const runBacktest = async (strategyId: string | null, symbol: string, config?: BacktestConfig): Promise<BacktestResult> => {
  const payload = { strategyId, symbol, ...config };
  
  return executeWithFallback(API_ENDPOINTS.BACKTEST, { method: 'POST', body: JSON.stringify(payload) }, async () => {
      // MOCK FALLBACK ONLY IF BACKEND IS DOWN
      await delay(1500); 
      console.warn("Using Fallback Mock for Backtest");
      const trades: Trade[] = [];
      const equityCurve = [];
      let value = config?.capital || 100000;
      let peak = value;
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
      }

      return {
        id: Math.random().toString(),
        strategyName: config?.strategyName || 'Mock Strategy (Backend Down)',
        symbol,
        timeframe: Timeframe.D1,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        metrics: {
          totalReturnPct: 12.5, cagr: 12.5, sharpeRatio: 1.8, sortinoRatio: 2.1, calmarRatio: 1.5,
          maxDrawdownPct: 12.0, avgDrawdownDuration: '15 days', winRate: 60,
          profitFactor: 1.6, kellyCriterion: 0.1, totalTrades: 50,
          consecutiveLosses: 3, alpha: 0.05, beta: 0.9, volatility: 14, expectancy: 0.4
        },
        monthlyReturns: [],
        equityCurve,
        trades: [],
        status: 'completed'
      };
  });
};

export interface OptimizationRanges {
    rsi_period?: { min: number, max: number, step: number };
    rsi_lower?: { min: number, max: number, step: number };
}

export const runOptimization = async (symbol: string = 'NIFTY 50', strategyId: string = '1', ranges: OptimizationRanges = {}): Promise<{ grid: OptimizationResult[], wfo: WFOResult[] }> => {
    // Call the REAL backend optimization endpoint with ranges
    return executeWithFallback(API_ENDPOINTS.OPTIMIZATION, { method: 'POST', body: JSON.stringify({ symbol, strategyId, ranges }) }, async () => {
        await delay(1000);
        return { 
            grid: [
                { paramSet: { rsi: 14, lower: 30 }, sharpe: 1.5, returnPct: 12, drawdown: 5 },
                { paramSet: { rsi: 21, lower: 35 }, sharpe: 1.8, returnPct: 15, drawdown: 4 }
            ], 
            wfo: [] 
        };
    });
};

export const runMonteCarlo = async (simulations: number = 100, volatilityMultiplier: number = 1.0): Promise<MonteCarloPath[]> => {
    return executeWithFallback(API_ENDPOINTS.MONTE_CARLO, { method: 'POST', body: JSON.stringify({ simulations, volatilityMultiplier }) }, async () => {
        await delay(1000);
        return Array.from({length: simulations}, (_, i) => ({ id: i, values: [100, 101, 99, 102] }));
    });
};
