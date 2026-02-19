
import { OptionChainItem, PaperPosition } from '../types';
import { API_ENDPOINTS, CONFIG } from '../config';
import { executeWithFallback, delay, fetchClient } from './http';

export interface DataHealthReport {
    score: number;
    missingCandles: number;
    zeroVolumeCandles: number;
    totalCandles: number;
    gaps: string[];
    status: 'EXCELLENT' | 'GOOD' | 'POOR' | 'CRITICAL';
}

export const getOptionChain = async (symbol: string, expiry: string): Promise<OptionChainItem[]> => {
    return executeWithFallback(API_ENDPOINTS.OPTION_CHAIN, { method: 'POST', body: JSON.stringify({ symbol, expiry }) }, async () => {
        const spot = symbol === 'NIFTY 50' ? 22150 : 46500;
        const step = symbol === 'NIFTY 50' ? 50 : 100;
        const strikes: OptionChainItem[] = [];
        for (let i = -10; i <= 10; i++) {
            const strike = Math.round(spot / step) * step + (i * step);
            strikes.push({
                strike,
                cePremium: Math.max(1, (spot - strike) + Math.random() * 50 + 20),
                pePremium: Math.max(1, (strike - spot) + Math.random() * 50 + 20),
                ceIv: 15 + Math.random() * 2,
                peIv: 16 + Math.random() * 2,
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

export const validateMarketData = async (symbol: string, timeframe: string, start: string, end: string): Promise<DataHealthReport> => {
    // Issue #18: Wire to real backend endpoint.
    // Falls back to mock calculation if backend is unreachable.
    try {
        const data = await fetchClient<DataHealthReport>(API_ENDPOINTS.MARKET_VALIDATE, {
            method: 'POST',
            body: JSON.stringify({ symbol, timeframe, from_date: start, to_date: end }),
        });
        return data;
    } catch {
        // Fallback: compute locally so the UI never breaks during development
        await delay(600);

        const startDt = new Date(start);
        const endDt = new Date(end);
        const diffDays = Math.ceil(Math.abs(endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24));

        const isPoor = symbol === 'HDFCBANK';
        const missing = isPoor ? Math.floor(diffDays * 0.15) : Math.floor(Math.random() * 5);
        const zeroVol = isPoor ? Math.floor(diffDays * 0.05) : Math.floor(Math.random() * 2);
        const total = diffDays * (timeframe === '1d' ? 1 : 375);

        const rawScore = 100 - ((missing * 2) + (zeroVol * 1));
        const score = Math.max(0, Math.min(100, rawScore));

        let status: 'EXCELLENT' | 'GOOD' | 'POOR' | 'CRITICAL' = 'EXCELLENT';
        if (score < 98) status = 'GOOD';
        if (score < 85) status = 'POOR';
        if (score < 60) status = 'CRITICAL';

        const gaps: string[] = [];
        if (missing > 0) {
            const gapDate = new Date(startDt);
            gapDate.setDate(gapDate.getDate() + Math.floor(diffDays / 2));
            gaps.push(gapDate.toISOString().split('T')[0]);
        }

        return {
            score: parseFloat(score.toFixed(1)),
            missingCandles: missing,
            zeroVolumeCandles: zeroVol,
            totalCandles: total,
            gaps,
            status,
        };
    }
};
