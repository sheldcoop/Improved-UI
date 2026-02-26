
import { Strategy, StrategyPreset, RuleGroup } from '../types';
import { CONFIG, API_ENDPOINTS } from '../config';
import { delay, executeWithFallback, fetchClient } from './http';

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
        id: '2', name: 'Bollinger Bands Mean Reversion', description: 'Buy below lower band, sell above middle band', params: [
            { name: 'period', type: 'int', default: 20 },
            { name: 'std_dev', type: 'float', default: 2.0 }
        ]
    },
    {
        id: '3', name: 'MACD Crossover', description: 'MACD line crosses signal line', params: [
            { name: 'fast', type: 'int', default: 12 },
            { name: 'slow', type: 'int', default: 26 },
            { name: 'signal', type: 'int', default: 9 }
        ]
    },
    {
        id: '4', name: 'EMA Crossover', description: 'Fast EMA crosses Slow EMA', params: [
            { name: 'fast', type: 'int', default: 20 },
            { name: 'slow', type: 'int', default: 50 }
        ]
    },
    {
        id: '5', name: 'Supertrend', description: 'ATR-based trend following', params: [
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
        id: '7', name: 'ATR Channel Breakout', description: 'Price breaks ATR channels', params: [
            { name: 'period', type: 'int', default: 14 },
            { name: 'multiplier', type: 'float', default: 2.0 }
        ]
    },
];

export const fetchStrategies = async (): Promise<StrategyPreset[]> => {
    return executeWithFallback(API_ENDPOINTS.STRATEGIES, undefined, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
        return [...mockStrategies];
    });
};

export const saveStrategy = async (strategy: Strategy): Promise<Strategy> => {
    const result = await fetchClient<{ status: string; strategy: Strategy }>(
        API_ENDPOINTS.STRATEGIES,
        { method: 'POST', body: JSON.stringify(strategy) }
    );
    return result.strategy;
};

export const fetchSavedStrategies = async (): Promise<Strategy[]> => {
    try {
        return await fetchClient<Strategy[]>(`${API_ENDPOINTS.STRATEGIES}/saved`);
    } catch {
        return [];
    }
};

export const deleteStrategy = async (id: string): Promise<void> => {
    await fetchClient<{ status: string }>(`${API_ENDPOINTS.STRATEGIES}/${id}`, { method: 'DELETE' });
};

export interface PreviewResult {
    status: string;
    entry_count: number;
    exit_count: number;
    entry_dates: string[];
    exit_dates: string[];
    prices: number[];
    dates: string[];
}

export const previewStrategy = async (strategy: Strategy, symbol: string, signal?: AbortSignal): Promise<PreviewResult> => {
    return fetchClient<PreviewResult>(`${API_ENDPOINTS.STRATEGIES}/preview`, {
        method: 'POST',
        signal,
        body: JSON.stringify({
            ...strategy,
            strategyId: strategy.id,   // backend looks up strategyId, not id
            symbol,
            timeframe: strategy.timeframe,
        }),
    });
};

export interface GenerateResult {
    status: string;
    name: string;
    entryLogic: RuleGroup;
    exitLogic: RuleGroup;
}

export const generateStrategy = async (prompt: string): Promise<GenerateResult> => {
    return fetchClient<GenerateResult>(`${API_ENDPOINTS.STRATEGIES}/generate`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
    });
};
