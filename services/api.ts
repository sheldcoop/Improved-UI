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
  await delay(2000); // Simulate processing time
  
  // Generate fake equity curve
  const equityCurve = [];
  let value = 100000;
  let peak = 100000;
  
  for (let i = 0; i < 100; i++) {
    const change = (Math.random() - 0.45) * 2000; // Slight upward bias
    value += change;
    if (value > peak) peak = value;
    const drawdown = ((peak - value) / peak) * 100;
    
    equityCurve.push({
      date: new Date(2023, 0, 1 + i).toISOString().split('T')[0],
      value: value,
      drawdown: drawdown
    });
  }

  return {
    id: Math.random().toString(36).substring(7),
    strategyName: mockStrategies.find(s => s.id === strategyId)?.name || 'Unknown Strategy',
    symbol: symbol,
    timeframe: Timeframe.D1,
    startDate: '2023-01-01',
    endDate: '2023-04-10',
    metrics: {
      totalReturnPct: 15.4,
      cagr: 22.1,
      sharpeRatio: 1.85,
      maxDrawdownPct: 8.5,
      winRate: 58.0,
      profitFactor: 1.6,
      totalTrades: 42
    },
    equityCurve,
    status: 'completed'
  };
};
