import { BacktestResult, Strategy, Timeframe, AssetClass, IndicatorType, Operator, OptimizationResult, WFOResult, MonteCarloPath, PaperPosition } from '../types';

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock Data
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
  await delay(500);
  return [...mockStrategies];
};

export const saveStrategy = async (strategy: Strategy): Promise<void> => {
  await delay(800);
  const existingIndex = mockStrategies.findIndex(s => s.id === strategy.id);
  if (existingIndex >= 0) {
    mockStrategies[existingIndex] = strategy;
  } else {
    mockStrategies.push(strategy);
  }
};

export const runBacktest = async (strategyId: string, symbol: string): Promise<BacktestResult> => {
  await delay(2000); 
  
  const equityCurve = [];
  let value = 100000;
  let peak = 100000;
  
  for (let i = 0; i < 250; i++) {
    const change = (Math.random() - 0.48) * 2000; 
    value += change;
    if (value > peak) peak = value;
    const drawdown = ((peak - value) / peak) * 100;
    
    equityCurve.push({
      date: new Date(2023, 0, 1 + i).toISOString().split('T')[0],
      value: value,
      drawdown: drawdown
    });
  }

  const monthlyReturns = [];
  for(let m=0; m<12; m++) {
    monthlyReturns.push({
      year: 2023,
      month: m,
      returnPct: (Math.random() * 10) - 3 
    });
  }

  return {
    id: Math.random().toString(36).substring(7),
    strategyName: mockStrategies.find(s => s.id === strategyId)?.name || 'Unknown Strategy',
    symbol: symbol,
    timeframe: Timeframe.D1,
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    metrics: {
      totalReturnPct: 24.5,
      cagr: 24.5,
      sharpeRatio: 1.95,
      sortinoRatio: 2.4,
      calmarRatio: 1.8,
      maxDrawdownPct: 12.5,
      avgDrawdownDuration: '18 days',
      winRate: 62.0,
      profitFactor: 1.75,
      kellyCriterion: 0.12,
      totalTrades: 142,
      consecutiveLosses: 4
    },
    monthlyReturns,
    equityCurve,
    status: 'completed'
  };
};

export const getOptionChain = async (symbol: string, expiry: string) => {
    const spot = symbol === 'NIFTY 50' ? 22150 : 46500;
    const step = symbol === 'NIFTY 50' ? 50 : 100;
    const strikes = [];
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
};

// --- NEW MOCK SERVICES ---

export const runOptimization = async (): Promise<{ grid: OptimizationResult[], wfo: WFOResult[] }> => {
    await delay(1500);
    const grid = [];
    for(let i=10; i<=20; i+=2) { // RSI Period
        for(let j=2; j<=6; j+=1) { // Stop Loss
            grid.push({
                paramSet: { rsi: i, stopLoss: j },
                sharpe: 1 + Math.random(),
                returnPct: (Math.random() * 20) + 5,
                drawdown: 10 + Math.random() * 10
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
};

export const runMonteCarlo = async (simulations: number = 100): Promise<MonteCarloPath[]> => {
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
};

export const getPaperPositions = async (): Promise<PaperPosition[]> => {
    await delay(500);
    return [
        { id: 'p1', symbol: 'NIFTY 50', side: 'LONG', qty: 50, avgPrice: 22100, ltp: 22150, pnl: 2500, pnlPct: 0.22, entryTime: '10:30 AM', status: 'OPEN' },
        { id: 'p2', symbol: 'BANKNIFTY', side: 'SHORT', qty: 15, avgPrice: 46600, ltp: 46500, pnl: 1500, pnlPct: 0.32, entryTime: '11:15 AM', status: 'OPEN' },
        { id: 'p3', symbol: 'RELIANCE', side: 'LONG', qty: 100, avgPrice: 2940, ltp: 2950, pnl: 1000, pnlPct: 0.34, entryTime: '09:45 AM', status: 'OPEN' },
    ];
};
