
import { BacktestResult, Strategy, Timeframe, AssetClass, IndicatorType, Operator, OptimizationResult, WFOResult, MonteCarloPath, Trade, Logic, PositionSizeMode, StrategyPreset } from '../types';

// --- MOCKS ---
let mockStrategies: StrategyPreset[] = [
    {
        id: '1',
        name: 'RSI Mean Reversion',
        description: 'Buy when RSI < 30, Sell when RSI > 70',
        params: [
            { name: 'rsi_period', type: 'int', default: 14 },
            { name: 'rsi_lower', type: 'int', default: 30 },
            { name: 'rsi_upper', type: 'int', default: 70 }
        ]
    },
    {
        id: '2',
        name: 'Bollinger Bands',
        description: 'Buy on lower band, Sell on upper band',
        params: [
            { name: 'period', type: 'int', default: 20 },
            { name: 'std_dev', type: 'float', default: 2.0 }
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
    rsi_period?: { min: number, max: number, step: number };
    rsi_lower?: { min: number, max: number, step: number };
}

export const runOptimization = async (symbol: string = 'NIFTY 50', strategyId: string = '1', ranges: OptimizationRanges = {}): Promise<{ grid: OptimizationResult[], wfo: WFOResult[] }> => {
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

export const runWFO = async (symbol: string, strategyId: string, ranges: OptimizationRanges, wfoConfig: any): Promise<WFOResult[]> => {
    return executeWithFallback(`${API_ENDPOINTS.OPTIMIZATION.replace('/run', '')}/wfo`, { method: 'POST', body: JSON.stringify({ symbol, strategyId, ranges, wfoConfig }) }, async () => {
        await delay(1000);
        return [
            { period: 'Window 1', type: 'TEST', params: 'P=14', returnPct: 5, sharpe: 1.2, drawdown: 2 },
            { period: 'Window 2', type: 'TEST', params: 'P=16', returnPct: -2, sharpe: 0.5, drawdown: 8 },
        ];
    });
};

export const runMonteCarlo = async (simulations: number = 100, volatilityMultiplier: number = 1.0): Promise<MonteCarloPath[]> => {
    return executeWithFallback(API_ENDPOINTS.MONTE_CARLO, { method: 'POST', body: JSON.stringify({ simulations, volatilityMultiplier }) }, async () => {
        await delay(1000);
        return Array.from({ length: simulations }, (_, i) => ({ id: i, values: [100, 101, 99, 102] }));
    });
};
