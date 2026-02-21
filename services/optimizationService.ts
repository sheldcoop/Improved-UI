
import { OptimizationResult } from '../types';
import { API_ENDPOINTS } from '../config';
import { delay, executeWithFallback } from './http';

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

export const runOOSValidation = async (symbol: string, strategyId: string, paramSets: any[], startDate: string, endDate: string): Promise<any> => {
    return executeWithFallback(`${API_ENDPOINTS.OPTIMIZATION.replace('/run', '')}/oos-validate`, {
        method: 'POST',
        body: JSON.stringify({ symbol, strategyId, paramSets, startDate, endDate })
    }, async () => {
        await delay(1000);
        return {
            results: paramSets.map(ps => ({
                paramSet: ps,
                metrics: { totalReturnPct: 2.5, sharpeRatio: 1.1 }
            }))
        };
    });
};
