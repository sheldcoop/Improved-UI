
import { Strategy, StrategyPreset } from '../types';
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
    const endpoint = API_ENDPOINTS.STRATEGIES;
    return executeWithFallback(endpoint, { method: 'POST', body: JSON.stringify(strategy) }, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
    });
};
