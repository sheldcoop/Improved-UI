import { BacktestResult, Strategy, Timeframe, AssetClass, IndicatorType, Operator, OptimizationResult, WFOResult, MonteCarloPath, PaperPosition, Trade, OptionChainItem } from '../types';
import { CONFIG, API_ENDPOINTS } from '../config';
import { logNetworkEvent } from '../components/DebugConsole';

// --- HELPER: Network Delay Simulation ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Generic API Fetcher ---
async function fetchClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const dhanClientId = localStorage.getItem('DHAN_CLIENT_ID') || '';
  const dhanAccessToken = localStorage.getItem('DHAN_ACCESS_TOKEN') || '';
  const alphaVantageKey = localStorage.getItem('ALPHA_VANTAGE_KEY') || '';
  const useAlphaVantage = localStorage.getItem('USE_ALPHA_VANTAGE') === 'true';

  const method = options?.method || 'GET';
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const requestId = Math.random().toString(36).substring(7);
  const startTime = performance.now();
  const timestamp = new Date().toLocaleTimeString();

  // Log Request Start
  if (!endpoint.includes('/debug/')) {
    logNetworkEvent({
        id: requestId,
        method,
        url: endpoint,
        timestamp,
        type: 'req'
    });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-dhan-client-id': dhanClientId,
        'x-dhan-access-token': dhanAccessToken,
        'x-alpha-vantage-key': alphaVantageKey,
        'x-use-alpha-vantage': useAlphaVantage ? 'true' : 'false'
      },
      ...options,
    });

    const endTime = performance.now();
    const duration = `${(endTime - startTime).toFixed(0)}ms`;

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    // Log Response Success
    if (!endpoint.includes('/debug/')) {
        logNetworkEvent({
            id: requestId,
            method,
            url: endpoint,
            status: response.status,
            duration,
            timestamp: new Date().toLocaleTimeString(),
            type: 'res'
        });
    }

    return await response.json();
  } catch (error: any) {
    // Log Error
    if (!endpoint.includes('/debug/')) {
        logNetworkEvent({
            id: requestId,
            method,
            url: endpoint,
            status: 0,
            duration: 'ERR',
            timestamp: new Date().toLocaleTimeString(),
            type: 'err'
        });
    }
    throw error; // Re-throw to be handled by the fallback logic
  }
}

// --- HELPER: Smart Execution Wrapper ---
// Tries to fetch from backend, falls back to mock if it fails
async function executeWithFallback<T>(
    endpoint: string, 
    options: RequestInit | undefined, 
    mockFn: () => Promise<T>
): Promise<T> {
    if (!CONFIG.USE_MOCK_DATA) {
        try {
            return await fetchClient<T>(endpoint, options);
        } catch (error) {
            console.warn(`[Auto-Fallback] Backend ${endpoint} unreachable. Using Mock Data.`);
        }
    }
    // Fallback to mock data
    return mockFn();
}

// ============================================================================
// STRATEGY SERVICE
// ============================================================================

let mockStrategies: Strategy[] = [
  {
    id: '1',
    name: 'RSI Mean Reversion',
    description: 'Buy when RSI < 30, Sell when RSI > 70',
    assetClass: AssetClass.EQUITY,
    timeframe: Timeframe.D1,
    entryRules: [{ id: 'c1', indicator: IndicatorType.RSI, period: 14, operator: Operator.LESS_THAN, value: 30 }],
    exitRules: [{ id: 'c2', indicator: IndicatorType.RSI, period: 14, operator: Operator.GREATER_THAN, value: 70 }],
    stopLossPct: 2.0,
    takeProfitPct: 5.0,
    created: '2024-01-15'
  }
];

export const fetchStrategies = async (): Promise<Strategy[]> => {
  return executeWithFallback(API_ENDPOINTS.STRATEGIES, undefined, async () => {
      await delay(CONFIG.MOCK_DELAY_MS);
      return [...mockStrategies];
  });
};

export const saveStrategy = async (strategy: Strategy): Promise<void> => {
    return executeWithFallback(API_ENDPOINTS.STRATEGIES, { method: 'POST', body: JSON.stringify(strategy) }, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
        const existingIndex = mockStrategies.findIndex(s => s.id === strategy.id);
        if (existingIndex >= 0) {
            mockStrategies[existingIndex] = strategy;
        } else {
            mockStrategies.push(strategy);
        }
    });
};

// ============================================================================
// BACKTEST SERVICE
// ============================================================================

export const runBacktest = async (strategyId: string, symbol: string): Promise<BacktestResult> => {
  return executeWithFallback(API_ENDPOINTS.BACKTEST, { method: 'POST', body: JSON.stringify({ strategyId, symbol }) }, async () => {
      await delay(2000); 
      
      // --- MOCK LOGIC GENERATOR ---
      const trades: Trade[] = [];
      const equityCurve = [];
      let value = 100000;
      let peak = 100000;
      const startDate = new Date('2023-01-01');

      // Generate 250 days of data
      for (let i = 0; i < 250; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        const dailyReturn = (Math.random() - 0.48) * 0.02; // Daily % change
        const change = value * dailyReturn;
        value += change;
        
        if (value > peak) peak = value;
        const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
        
        equityCurve.push({
          date: dateStr,
          value: Number(value.toFixed(2)),
          drawdown: Number(drawdown.toFixed(2))
        });

        // Generate random trades (~20% probability per day)
        if (Math.random() > 0.8) {
            const isWin = Math.random() > 0.45;
            const entryPrice = 100 + (Math.random() * 50);
            const exitPrice = isWin ? entryPrice * 1.05 : entryPrice * 0.97;
            const pnl = (exitPrice - entryPrice) * 100; // Assume 100 qty

            trades.push({
                id: `t-${i}`,
                entryDate: dateStr,
                exitDate: new Date(currentDate.setDate(currentDate.getDate() + 2)).toISOString().split('T')[0],
                side: Math.random() > 0.5 ? 'LONG' : 'SHORT',
                entryPrice: Number(entryPrice.toFixed(2)),
                exitPrice: Number(exitPrice.toFixed(2)),
                pnl: Number(pnl.toFixed(2)),
                pnlPct: Number(((exitPrice - entryPrice)/entryPrice * 100).toFixed(2)),
                status: isWin ? 'WIN' : 'LOSS'
            });
        }
      }

      const totalReturn = ((value - 100000) / 100000) * 100;

      return {
        id: Math.random().toString(36).substring(7),
        strategyName: mockStrategies.find(s => s.id === strategyId)?.name || 'Unknown Strategy',
        symbol: symbol,
        timeframe: Timeframe.D1,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        metrics: {
          totalReturnPct: Number(totalReturn.toFixed(2)),
          cagr: Number(totalReturn.toFixed(2)),
          sharpeRatio: 1.95,
          sortinoRatio: 2.4,
          calmarRatio: 1.8,
          maxDrawdownPct: 12.5,
          avgDrawdownDuration: '18 days',
          winRate: 62.0,
          profitFactor: 1.75,
          kellyCriterion: 0.12,
          totalTrades: trades.length,
          consecutiveLosses: 4,
          alpha: 0.05,
          beta: 0.85,
          volatility: 14.2,
          expectancy: 0.45
        },
        monthlyReturns: Array.from({length: 12}, (_, i) => ({
          year: 2023,
          month: i,
          returnPct: Number(((Math.random() * 10) - 3).toFixed(2))
        })),
        equityCurve,
        trades: trades.sort((a,b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()),
        status: 'completed'
      };
  });
};

// ============================================================================
// MARKET DATA SERVICE
// ============================================================================

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

// ============================================================================
// OPTIMIZATION & RISK SERVICE
// ============================================================================

export const runOptimization = async (): Promise<{ grid: OptimizationResult[], wfo: WFOResult[] }> => {
    return executeWithFallback(API_ENDPOINTS.OPTIMIZATION, undefined, async () => {
        await delay(CONFIG.MOCK_DELAY_MS);
        const grid = [];
        for(let i=10; i<=20; i+=2) { // RSI Period
            for(let j=2; j<=6; j+=1) { // Stop Loss
                grid.push({
                    paramSet: { rsi: i, stopLoss: j },
                    sharpe: Number((1 + Math.random()).toFixed(2)),
                    returnPct: Number(((Math.random() * 20) + 5).toFixed(2)),
                    drawdown: Number((10 + Math.random() * 10).toFixed(2))
                });
            }
        }
        
        const wfo = [
            { period: 'Jan-Mar', isOOS: true, returnPct: 4.2, sharpe: 1.8 },
            { period: 'Apr-Jun', isOOS: true, returnPct: -1.5, sharpe: 0.5 },
            { period: 'Jul-Sep', isOOS: true, returnPct: 6.8, sharpe: 2.2 },
            { period: 'Oct-Dec', isOOS: true, returnPct: 3.1, sharpe: 1.4 },
        ];
        return { grid, wfo };
    });
};

export const runMonteCarlo = async (simulations: number = 100): Promise<MonteCarloPath[]> => {
    return executeWithFallback(API_ENDPOINTS.MONTE_CARLO, { method: 'POST', body: JSON.stringify({ simulations }) }, async () => {
        await delay(1000);
        const paths: MonteCarloPath[] = [];
        const days = 100;
        
        for(let i=0; i<simulations; i++) {
            const values = [100]; // Start at 100 (normalized)
            for(let d=0; d<days; d++) {
                const change = (Math.random() - 0.48) * 2; // Daily fluctuation
                values.push(values[values.length-1] + change);
            }
            paths.push({ id: i, values });
        }
        return paths;
    });
};

export const getPaperPositions = async (): Promise<PaperPosition[]> => {
    return executeWithFallback(API_ENDPOINTS.PAPER_TRADING, undefined, async () => {
        await delay(500);
        return [
            { id: 'p1', symbol: 'NIFTY 50', side: 'LONG', qty: 50, avgPrice: 22100, ltp: 22150, pnl: 2500, pnlPct: 0.22, entryTime: '10:30 AM', status: 'OPEN' },
            { id: 'p2', symbol: 'BANKNIFTY', side: 'SHORT', qty: 15, avgPrice: 46600, ltp: 46500, pnl: 1500, pnlPct: 0.32, entryTime: '11:15 AM', status: 'OPEN' },
            { id: 'p3', symbol: 'RELIANCE', side: 'LONG', qty: 100, avgPrice: 2940, ltp: 2950, pnl: 1000, pnlPct: 0.34, entryTime: '09:45 AM', status: 'OPEN' },
        ];
    });
};