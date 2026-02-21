
import { OptionChainItem } from '../types';
import { API_ENDPOINTS } from '../config';
import { executeWithFallback, fetchClient } from './http';
import { generateMockOptionChain, generateMockDataHealthReport } from './mockData';

export interface DataHealthReport {
    score: number;
    missingCandles: number;
    zeroVolumeCandles: number;
    totalCandles: number;
    gaps: string[];
    status: 'EXCELLENT' | 'GOOD' | 'POOR' | 'CRITICAL';
    note?: string;
}

/**
 * Fetches the option chain for a given symbol and expiry.
 * Falls back to centralized mock generation if the backend is unreachable.
 */
export const getOptionChain = async (symbol: string, expiry: string): Promise<OptionChainItem[]> => {
    return executeWithFallback(
        API_ENDPOINTS.OPTION_CHAIN,
        { method: 'POST', body: JSON.stringify({ symbol, expiry }) },
        () => generateMockOptionChain(symbol, expiry)
    );
};

/**
 * Validates market data quality via the backend API.
 * Falls back to a mock report for consistent UI behavior.
 */
export const validateMarketData = async (symbol: string, timeframe: string, start: string, end: string): Promise<DataHealthReport> => {
    return executeWithFallback(
        API_ENDPOINTS.MARKET_VALIDATE,
        { method: 'POST', body: JSON.stringify({ symbol, timeframe, from_date: start, to_date: end }) },
        () => generateMockDataHealthReport()
    );
};

/**
 * Fetches and validates market data in one request.
 */
export const fetchAndValidateMarketData = async (symbol: string, timeframe: string, start: string, end: string): Promise<any> => {
    return fetchClient<any>(API_ENDPOINTS.MARKET_FETCH, {
        method: 'POST',
        body: JSON.stringify({ symbol, timeframe, from_date: start, to_date: end }),
    });
};
