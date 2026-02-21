
import { BacktestResult, Timeframe, MonteCarloPath, OptionChainItem } from '../types';
import { delay } from './http';

/**
 * Generates a mock equity curve for a given date range.
 */
export const generateMockEquityCurve = (startDate: Date, endDate: Date, initialCapital: number) => {
    const equityCurve = [];
    let value = initialCapital;
    let peak = value;

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 250;

    for (let i = 0; i <= diffDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dailyReturn = (Math.random() - 0.48) * 0.02;
        value += value * dailyReturn;
        if (value > peak) peak = value;

        equityCurve.push({
            date: dateStr,
            value: Number(value.toFixed(2)),
            drawdown: peak > 0 ? Number((((peak - value) / peak) * 100).toFixed(2)) : 0
        });
    }
    return equityCurve;
};

/**
 * Generates a full mock BacktestResult.
 */
export const generateMockBacktestResult = async (
    symbol: string,
    strategyName: string = 'Mock Strategy',
    config: any = {}
): Promise<BacktestResult> => {
    await delay(1500);
    const capital = config.capital || 100000;
    const startDate = new Date(config.start_date || '2023-01-01');
    const endDate = new Date(config.end_date || '2023-12-31');

    return {
        id: `mock_${Math.random().toString(36).substr(2, 6)}`,
        strategyName: `${strategyName} (Mock)`,
        symbol,
        timeframe: config.timeframe || Timeframe.D1,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        metrics: {
            totalReturnPct: 15.4,
            cagr: 12.5,
            sharpeRatio: 1.85,
            sortinoRatio: 2.1,
            calmarRatio: 1.6,
            maxDrawdownPct: 8.5,
            avgDrawdownDuration: '12 days',
            winRate: 58,
            profitFactor: 1.75,
            kellyCriterion: 0.12,
            totalTrades: 42,
            consecutiveLosses: 3,
            alpha: 0.04,
            beta: 0.85,
            volatility: 12,
            expectancy: 0.35
        },
        monthlyReturns: [],
        equityCurve: generateMockEquityCurve(startDate, endDate, capital),
        trades: [],
        status: 'completed'
    };
};

/**
 * Generates mock Monte Carlo simulation paths.
 */
export const generateMockMonteCarlo = async (simulations: number): Promise<MonteCarloPath[]> => {
    await delay(1000);
    return Array.from({ length: simulations }, (_, i) => ({
        id: i,
        values: [100, 102, 101, 105, 103, 108, 107, 112]
    }));
};

/**
 * Generates mock instrument search results.
 */
export const generateMockInstruments = async (query: string) => {
    await delay(500);
    const mockData = [
        { symbol: 'NIFTY 50', display_name: 'Nifty 50 Index', security_id: '13', instrument_type: 'INDEX' },
        { symbol: 'RELIANCE', display_name: 'Reliance Industries', security_id: '2885', instrument_type: 'EQUITY' },
        { symbol: 'TCS', display_name: 'Tata Consultancy Services', security_id: '11536', instrument_type: 'EQUITY' },
        { symbol: 'HDFCBANK', display_name: 'HDFC Bank Ltd', security_id: '1333', instrument_type: 'EQUITY' }
    ];
    return mockData.filter(item =>
        item.symbol.toLowerCase().includes(query.toLowerCase()) ||
        item.display_name.toLowerCase().includes(query.toLowerCase())
    );
};

/**
 * Generates mock option chain data.
 */
export const generateMockOptionChain = async (symbol: string, expiry: string): Promise<OptionChainItem[]> => {
    await delay(1000);
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
};

/**
 * Generates a mock Data Health Report.
 */
export const generateMockDataHealthReport = async (): Promise<any> => {
    await delay(800);
    return {
        score: 95,
        missingCandles: 0,
        zeroVolumeCandles: 0,
        totalCandles: 1500,
        gaps: [],
        status: 'EXCELLENT',
        note: 'Mock validation passed.'
    };
};
