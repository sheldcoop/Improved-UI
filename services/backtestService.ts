
import { BacktestResult, MonteCarloResult } from '../types';
import { API_ENDPOINTS } from '../config';
import { executeWithFallback, fetchClient } from './http';
import { generateMockBacktestResult } from './mockData';

export interface BacktestConfig {
    slippage?: number;
    commission?: number;
    capital?: number;
    strategyName?: string;
    [key: string]: any;
}

/**
 * Runs a backtest by calling the backend API.
 * Falls back to centralized mock generation if the backend is unreachable.
 */
export const runBacktest = async (strategyId: string | null, symbol: string, config?: BacktestConfig): Promise<BacktestResult> => {
    const payload = { strategyId, symbol, ...config };

    return executeWithFallback(
        API_ENDPOINTS.BACKTEST,
        { method: 'POST', body: JSON.stringify(payload) },
        () => generateMockBacktestResult(symbol, config?.strategyName, config)
    );
};

/**
 * GBM price-path Monte Carlo using historical volatility of a symbol.
 */
export const runMonteCarlo = async (
    simulations: number = 100,
    volMultiplier: number = 1.0,
    symbol: string = 'NIFTY 50',
): Promise<MonteCarloResult> => {
    return fetchClient<MonteCarloResult>(API_ENDPOINTS.MONTE_CARLO, {
        method: 'POST',
        body: JSON.stringify({ simulations, volMultiplier, symbol }),
    });
};

/**
 * Trade-sequence bootstrap Monte Carlo from actual backtest trade returns.
 * Resamples the trade list to reveal sequence-of-returns risk.
 */
export const runMonteCarloFromTrades = async (
    tradeReturns: number[],
    simulations: number = 200,
): Promise<MonteCarloResult> => {
    return fetchClient<MonteCarloResult>(API_ENDPOINTS.MONTE_CARLO_TRADES, {
        method: 'POST',
        body: JSON.stringify({ tradeReturns, simulations }),
    });
};
