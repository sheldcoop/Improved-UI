import { OptionChainItem, PaperPosition } from '../types';
import { API_ENDPOINTS, CONFIG } from '../config';
import { executeWithFallback, delay } from './http';

export const getOptionChain = async (symbol: string, expiry: string): Promise<OptionChainItem[]> => {
    return executeWithFallback(API_ENDPOINTS.OPTION_CHAIN, { method: 'POST', body: JSON.stringify({ symbol, expiry }) }, async () => {
        const spot = symbol === 'NIFTY 50' ? 22150 : 46500;
        const step = symbol === 'NIFTY 50' ? 50 : 100;
        const strikes: OptionChainItem[] = [];
        for(let i=-10; i<=10; i++) {
            const strike = Math.round(spot/step)*step + (i*step);
            strikes.push({
                strike,
                cePremium: Math.max(1, (spot - strike) + Math.random()*50 + 20),
                pePremium: Math.max(1, (strike - spot) + Math.random()*50 + 20),
                ceIv: 15 + Math.random()*2,
                peIv: 16 + Math.random()*2,
                ceOi: Math.floor(Math.random() * 1000000),
                peOi: Math.floor(Math.random() * 1000000)
            });
        }
        return strikes;
    });
};

export const getPaperPositions = async (): Promise<PaperPosition[]> => {
    return executeWithFallback(API_ENDPOINTS.PAPER_TRADING, undefined, async () => {
        await delay(500);
        return [
            { id: 'p1', symbol: 'NIFTY 50', side: 'LONG', qty: 50, avgPrice: 22100, ltp: 22150, pnl: 2500, pnlPct: 0.22, entryTime: '10:30 AM', status: 'OPEN' },
            { id: 'p2', symbol: 'BANKNIFTY', side: 'SHORT', qty: 15, avgPrice: 46600, ltp: 46500, pnl: 1500, pnlPct: 0.32, entryTime: '11:15 AM', status: 'OPEN' },
        ];
    });
};
