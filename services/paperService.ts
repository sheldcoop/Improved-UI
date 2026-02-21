
import { PaperPosition } from '../types';
import { API_ENDPOINTS } from '../config';
import { delay, executeWithFallback } from './http';

export const getPaperPositions = async (): Promise<PaperPosition[]> => {
    return executeWithFallback(API_ENDPOINTS.PAPER_TRADING, undefined, async () => {
        await delay(500);
        return [
            { id: 'p1', symbol: 'NIFTY 50', side: 'LONG', qty: 50, avgPrice: 22100, ltp: 22150, pnl: 2500, pnlPct: 0.22, entryTime: '10:30 AM', status: 'OPEN' },
            { id: 'p2', symbol: 'BANKNIFTY', side: 'SHORT', qty: 15, avgPrice: 46600, ltp: 46500, pnl: 1500, pnlPct: 0.32, entryTime: '11:15 AM', status: 'OPEN' },
        ];
    });
};
