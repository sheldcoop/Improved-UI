import { BacktestResult, Strategy, Timeframe, AssetClass, IndicatorType, Operator } from '../types';

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
  await delay(2500); // Simulate heavier processing time
  
  // Generate fake equity curve with more realism
  const equityCurve = [];
  let value = 100000;
  let peak = 100000;
  
  for (let i = 0; i < 250; i++) {
    const change = (Math.random() - 0.48) * 2000; // Slight upward bias
    value += change;
    if (value > peak) peak = value;
    const drawdown = ((peak - value) / peak) * 100;
    
    equityCurve.push({
      date: new Date(2023, 0, 1 + i).toISOString().split('T')[0],
      value: value,
      drawdown: drawdown
    });
  }

  // Mock Monthly Returns for Heatmap
  const monthlyReturns = [];
  for(let m=0; m<12; m++) {
    monthlyReturns.push({
      year: 2023,
      month: m,
      returnPct: (Math.random() * 10) - 3 // Random return between -3% and +7%
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
    // Mock option chain generator
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
