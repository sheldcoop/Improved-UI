
import { BacktestResult, MonteCarloPath } from '../types';
import { API_ENDPOINTS } from '../config';
import { executeWithFallback } from './http';
import { generateMockBacktestResult, generateMockMonteCarlo } from './mockData';

export interface BacktestConfig {
    slippage?: number;
    commission?: number;
    capital?: number;
    strategyName?: string;
    universe?: string;
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
 * Runs a Monte Carlo simulation.
 * Falls back to centralized mock generation if the backend is unreachable.
 */
export const runMonteCarlo = async (simulations: number = 100, volatilityMultiplier: number = 1.0): Promise<MonteCarloPath[]> => {
    return executeWithFallback(
        API_ENDPOINTS.MONTE_CARLO,
        { method: 'POST', body: JSON.stringify({ simulations, volatilityMultiplier }) },
        () => generateMockMonteCarlo(simulations)
    );
};
