
import { fetchClient } from './http';
import { generateMockInstruments } from './mockData';

// Re-export searchInstruments from the single source of truth
export { searchInstruments } from './marketService';


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
        slippage?: number;
        commission?: number;
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
