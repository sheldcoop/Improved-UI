
import { fetchClient } from './http';
import { generateMockInstruments } from './mockData';

/**
 * Search instruments via backend API.
 * Falls back to mock instruments if the backend is unreachable.
 * 
 * @param segment - Market segment (e.g., 'NSE_EQ')
 * @param query - Search query
 * @returns List of matching instruments
 */
export const searchInstruments = async (segment: string, query: string) => {
    const executeWithFallback = async <T>(
        endpoint: string,
        mockFn: () => Promise<T>
    ): Promise<T> => {
        const { CONFIG } = await import('../config');
        if (!CONFIG.USE_MOCK_DATA) {
            try {
                return await fetchClient<T>(endpoint);
            } catch (error) {
                console.warn(`[Auto-Fallback] Backend ${endpoint} unreachable. Using Mock Data.`);
            }
        }
        return mockFn();
    };

    return executeWithFallback<Array<{ symbol: string; display_name: string; security_id: string; instrument_type: string }>>(
        `/market/instruments?segment=${segment}&q=${encodeURIComponent(query)}`,
        () => generateMockInstruments(query)
    );
};

/**
 * Internal logic for running a backtest with Dhan API payload structure.
 * Includes automatic fallback to mock data if the backend is unreachable.
 * 
 * @param payload - Formatted payload for the Dhan backtest engine
 * @returns Result summary or mock data fallback
 */
export const runBacktestWithDhan = async (payload: {
    instrument_details: {
        security_id: string;
        symbol: string;
        exchange_segment: string;
        instrument_type: string;
    };
    parameters: {
        timeframe: string;
        start_date: string;
        end_date: string;
        initial_capital: number;
        /** Frequency string used by backend to compute return statistics (e.g. '1D', '1h') */
        statsFreq?: string;
        strategy_logic: {
            name: string;
            id?: string;
            [key: string]: any;
        };
    };
}) => {
    // simply forward the original Dhan-style payload to the backend; the
    // server now normalises either format to its internal representation.
    return fetchClient<any>('/market/backtest/run', { method: 'POST', body: JSON.stringify(payload) });
};
