
import { OptionChainItem } from '../types';
import { API_ENDPOINTS } from '../config';
import { executeWithFallback, fetchClient } from './http';
import { generateMockOptionChain, generateMockDataHealthReport } from './mockData';

export interface DataHealthReport {
    symbol: string;
    timeframe: string;
    totalCandles: number;
    nullCandles: number;
    gapCount: number;
    zeroVolumeCandles: number;
    geometricFailures: number;
    spikeFailures: number;
    sessionFailures: number;
    staleFailures: number;
    gaps: string[];
    details: string[];
    status: 'AUDITED' | 'ANOMALIES_DETECTED';
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

/**
 * Instrument type returned by the Dhan Scrip Master search.
 */
export interface Instrument {
    symbol: string;
    display_name: string;
    security_id: string;
    instrument_type: string;
    series?: string;
}

/**
 * Search instruments from the Dhan Scrip Master.
 *
 * Single source of truth for instrument search across the app.
 * Includes mock-data fallback when backend is unreachable.
 *
 * Args:
 *     segment: Market segment (e.g. 'NSE_EQ', 'NSE_SME').
 *     query: Search string (matched against symbol + display_name).
 *
 * Returns:
 *     List of matching instruments.
 */
export const searchInstruments = async (segment: string, query: string): Promise<Instrument[]> => {
    return executeWithFallback<Instrument[]>(
        `/market/instruments?segment=${encodeURIComponent(segment)}&q=${encodeURIComponent(query)}`,
        undefined,
        async () => {
            // Lightweight mock fallback — returns empty when backend is down
            const { generateMockInstruments } = await import('./mockData');
            return generateMockInstruments(query);
        },
    );
};
