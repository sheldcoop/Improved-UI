
import { Strategy, StrategyPreset, RuleGroup } from '../types';
import { CONFIG, API_ENDPOINTS } from '../config';
import { delay, executeWithFallback, fetchClient } from './http';

// --- MOCKS (offline fallback — mirrors backend PRESET_STRATEGIES format) ---
let mockStrategies: StrategyPreset[] = [
    {
        id: '1', name: 'RSI Mean Reversion', description: 'Buy when RSI < 30, Sell when RSI > 70',
        mode: 'VISUAL',
        params: [
            { name: 'period', type: 'int', default: 14 },
            { name: 'lower', type: 'int', default: 30 },
            { name: 'upper', type: 'int', default: 70 }
        ],
        entryLogic: {
            id: 'root_entry', type: 'GROUP', logic: 'AND' as any, conditions: [
                { id: 'c1', indicator: 'RSI' as any, period: 14, operator: 'Crosses Below' as any, compareType: 'STATIC', value: 30 }
            ]
        },
        exitLogic: {
            id: 'root_exit', type: 'GROUP', logic: 'AND' as any, conditions: [
                { id: 'c2', indicator: 'RSI' as any, period: 14, operator: 'Crosses Above' as any, compareType: 'STATIC', value: 70 }
            ]
        },
    },
    {
        id: '2', name: 'Bollinger Bands Mean Reversion', description: 'Buy below lower band, sell above middle band',
        mode: 'CODE',
        params: [{ name: 'period', type: 'int', default: 20 }, { name: 'std_dev', type: 'float', default: 2.0 }],
        pythonCode: "def signal_logic(df):\n    bb = vbt.BBANDS.run(df['close'], window=20, alpha=2.0)\n    entries = df['close'] < bb.lower\n    exits = df['close'] > bb.middle\n    return entries, exits",
    },
    {
        id: '3', name: 'MACD Crossover', description: 'MACD line crosses signal line',
        mode: 'CODE',
        params: [{ name: 'fast', type: 'int', default: 12 }, { name: 'slow', type: 'int', default: 26 }, { name: 'signal', type: 'int', default: 9 }],
        pythonCode: "def signal_logic(df):\n    macd = vbt.MACD.run(df['close'], fast_window=12, slow_window=26, signal_window=9)\n    entries = macd.macd.vbt.crossed_above(macd.signal)\n    exits = macd.macd.vbt.crossed_below(macd.signal)\n    return entries, exits",
    },
    {
        id: '4', name: 'EMA Crossover', description: 'Fast EMA crosses Slow EMA',
        mode: 'VISUAL',
        params: [{ name: 'fast', type: 'int', default: 20 }, { name: 'slow', type: 'int', default: 50 }],
        entryLogic: {
            id: 'root_entry', type: 'GROUP', logic: 'AND' as any, conditions: [
                { id: 'c1', indicator: 'EMA' as any, period: 20, operator: 'Crosses Above' as any, compareType: 'INDICATOR', rightIndicator: 'EMA' as any, rightPeriod: 50, value: 0 }
            ]
        },
        exitLogic: {
            id: 'root_exit', type: 'GROUP', logic: 'AND' as any, conditions: [
                { id: 'c2', indicator: 'EMA' as any, period: 20, operator: 'Crosses Below' as any, compareType: 'INDICATOR', rightIndicator: 'EMA' as any, rightPeriod: 50, value: 0 }
            ]
        },
    },
    {
        id: '5', name: 'Supertrend', description: 'ATR-based trend following',
        mode: 'CODE',
        params: [{ name: 'period', type: 'int', default: 10 }, { name: 'multiplier', type: 'float', default: 3.0 }],
        pythonCode: "def signal_logic(df):\n    atr = vbt.ATR.run(df['high'], df['low'], df['close'], window=10).atr\n    ema = vbt.MA.run(df['close'], 10, ewm=True).ma\n    entries = df['close'].vbt.crossed_above(ema + 3.0 * atr)\n    exits = df['close'].vbt.crossed_below(ema - 3.0 * atr)\n    return entries, exits",
    },
    {
        id: '6', name: 'Stochastic RSI', description: 'Stoch RSI crossover',
        mode: 'CODE',
        params: [{ name: 'rsi_period', type: 'int', default: 14 }, { name: 'k_period', type: 'int', default: 3 }, { name: 'd_period', type: 'int', default: 3 }],
        pythonCode: "def signal_logic(df):\n    rsi = vbt.RSI.run(df['close'], window=14).rsi\n    stoch = (rsi - rsi.rolling(3).min()) / (rsi.rolling(3).max() - rsi.rolling(3).min() + 1e-9) * 100\n    entries = stoch.vbt.crossed_above(20)\n    exits = stoch.vbt.crossed_below(80)\n    return entries, exits",
    },
    {
        id: '7', name: 'ATR Channel Breakout', description: 'Price breaks ATR channels',
        mode: 'CODE',
        params: [{ name: 'period', type: 'int', default: 14 }, { name: 'multiplier', type: 'float', default: 2.0 }],
        pythonCode: "def signal_logic(df):\n    atr = vbt.ATR.run(df['high'], df['low'], df['close'], window=14).atr\n    upper = df['high'].rolling(14).max() + 2.0 * atr\n    lower = df['low'].rolling(14).min() - 2.0 * atr\n    entries = df['close'].vbt.crossed_above(upper.shift(1))\n    exits = df['close'].vbt.crossed_below(lower.shift(1))\n    return entries, exits",
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
