
import { BacktestResult, Strategy, Timeframe, AssetClass, IndicatorType, Operator, OptimizationResult, WFOResult, MonteCarloPath, Trade, Logic, PositionSizeMode, StrategyPreset } from '../types';
import { CONFIG, API_ENDPOINTS } from '../config';
import { delay, executeWithFallback } from './http';

// --- MOCKS ---
let mockStrategies: StrategyPreset[] = [
    {
        id: '1', name: 'RSI Mean Reversion', description: 'Buy when RSI < 30, Sell when RSI > 70', params: [
            { name: 'period', type: 'int', default: 14 },
            { name: 'lower', type: 'int', default: 30 },
            { name: 'upper', type: 'int', default: 70 }
        ]
    },
    {
        id: '2', name: 'Bollinger Bands', description: 'Buy on lower band, Sell on upper band', params: [
            { name: 'period', type: 'int', default: 20 },
            { name: 'std_dev', type: 'float', default: 2.0 }
        ]
    },
    {
        id: '3', name: 'EMA Crossover', description: 'Fast EMA crosses Slow EMA', params: [
            { name: 'fast', type: 'int', default: 10 },
            { name: 'slow', type: 'int', default: 50 }
        ]
    },
    {
        id: '4', name: 'MACD Momentum', description: 'MACD line crosses signal line', params: [
            { name: 'fast', type: 'int', default: 12 },
            { name: 'slow', type: 'int', default: 26 },
            { name: 'signal', type: 'int', default: 9 }
        ]
    },
    {
        id: '5', name: 'SuperTrend Trend Following', description: 'SuperTrend direction changes', params: [
            { name: 'period', type: 'int', default: 10 },
            { name: 'multiplier', type: 'float', default: 3.0 }
        ]
    },
    {
        id: '6', name: 'Stochastic RSI', description: 'Stoch RSI crossover', params: [
            { name: 'rsi_period', type: 'int', default: 14 },
            { name: 'k_period', type: 'int', default: 3 },
            { name: 'd_period', type: 'int', default: 3 }
        ]
    },
    {
        id: '7', name: 'ATR Breakout', description: 'Price breaks ATR channels', params: [
            { name: 'period', type: 'int', default: 14 },
            { name: 'multiplier', type: 'float', default: 2.0 }
        ]
    },
    {
        id: '8', name: 'Volume Weighted Average Price (VWAP)', description: 'Price crosses VWAP', params: [
            { name: 'anchor', type: 'string', default: 'D' }
        ]
    }
];

export const fetchStrategies = async (): Promise<StrategyPreset[]> => {
    return executeWithFallback(API_ENDPOINTS.STRATEGIES, undefined, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
        return [...mockStrategies];
    });
};

export const saveStrategy = async (strategy: Strategy): Promise<void> => {
    // If saving to backend, we post to the strategies endpoint
    const endpoint = API_ENDPOINTS.STRATEGIES; // Now maps to /strategies

    return executeWithFallback(endpoint, { method: 'POST', body: JSON.stringify(strategy) }, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
        // const existingIndex = mockStrategies.findIndex(s => s.id === strategy.id);
        // if (existingIndex >= 0) mockStrategies[existingIndex] = strategy;
        // else mockStrategies.push(strategy);
    });
};

export interface BacktestConfig extends Partial<Strategy> {
    slippage?: number;
    commission?: number;
    capital?: number;
    strategyName?: string;
    universe?: string;
}

export const runBacktest = async (strategyId: string | null, symbol: string, config?: BacktestConfig): Promise<BacktestResult> => {
    const payload = { strategyId, symbol, ...config };

    return executeWithFallback(API_ENDPOINTS.BACKTEST, { method: 'POST', body: JSON.stringify(payload) }, async () => {
        // MOCK FALLBACK ONLY IF BACKEND IS DOWN
        await delay(1500);
        console.warn("Using Fallback Mock for Backtest");
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
    [key: string]: { min: number, max: number, step: number };
}

export const runOptimization = async (
    symbol: string = 'NIFTY 50',
    strategyId: string = '1',
    ranges: OptimizationRanges = {},
    config?: any
): Promise<{ grid: OptimizationResult[], bestParams: Record<string, number> }> => {
    return executeWithFallback(API_ENDPOINTS.OPTIMIZATION, { method: 'POST', body: JSON.stringify({ symbol, strategyId, ranges, ...config }) }, async () => {
        await delay(1000);
        return {
            grid: [
                { paramSet: { period: 14, lower: 30 }, sharpe: 1.5, returnPct: 12, drawdown: 5, trades: 40, winRate: 55, score: 1.5 },
                { paramSet: { period: 21, lower: 35 }, sharpe: 1.8, returnPct: 15, drawdown: 4, trades: 30, winRate: 60, score: 1.8 }
            ],
            bestParams: { period: 21, lower: 35 }
        };
    });
};

export const runAutoTune = async (
    symbol: string,
    strategyId: string,
    ranges: OptimizationRanges,
    targetDate: string,
    lookbackMonths: number,
    metric: string = 'sharpe',
    config?: any
): Promise<{ period: string, bestParams: Record<string, number>, grid: OptimizationResult[] }> => {
    const payload = { symbol, strategyId, ranges, timeframe: '1d', start_date: targetDate, lookback: lookbackMonths, metric, ...config };
    return executeWithFallback(`${API_ENDPOINTS.OPTIMIZATION.replace('/run', '')}/auto-tune`, { method: 'POST', body: JSON.stringify(payload) }, async () => {
        await delay(1000);
        return {
            period: "2025-07-31 to 2026-01-31",
            bestParams: { period: 10, lower: 25, upper: 75 },
            grid: []
        };
    });
};

export const runWFO = async (symbol: string, strategyId: string, ranges: OptimizationRanges, wfoConfig: any, config?: any): Promise<any> => {
    return executeWithFallback(`${API_ENDPOINTS.OPTIMIZATION.replace('/run', '')}/wfo`, { method: 'POST', body: JSON.stringify({ symbol, strategyId, ranges, wfoConfig, ...config }) }, async () => {
        await delay(3000);
        return {
            paramHistory: [
                { start: '2023-01-01', end: '2023-03-01', params: { period: 14 } },
                { start: '2023-03-01', end: '2023-06-01', params: { period: 16 } }
            ],
            metrics: {
                totalReturnPct: 5.5,
                sharpeRatio: 1.2
            },
            equityCurve: []
        };
    });
};

export const runMonteCarlo = async (simulations: number = 100, volatilityMultiplier: number = 1.0): Promise<MonteCarloPath[]> => {
    return executeWithFallback(API_ENDPOINTS.MONTE_CARLO, { method: 'POST', body: JSON.stringify({ simulations, volatilityMultiplier }) }, async () => {
        await delay(1000);
        return Array.from({ length: simulations }, (_, i) => ({ id: i, values: [100, 101, 99, 102] }));
    });
};
