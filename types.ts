export enum AssetClass {
  EQUITY = 'EQUITY',
  OPTIONS = 'OPTIONS',
  FUTURES = 'FUTURES'
}

export enum Timeframe {
  M5 = '5m',
  M15 = '15m',
  H1 = '1h',
  D1 = '1d'
}

export enum IndicatorType {
  RSI = 'RSI',
  SMA = 'SMA',
  EMA = 'EMA',
  MACD = 'MACD',
  BOL_UPPER = 'Bollinger Upper',
  BOL_LOWER = 'Bollinger Lower',
  CLOSE = 'Close Price',
  VOLUME = 'Volume'
}

export enum Operator {
  CROSSES_ABOVE = 'Crosses Above',
  CROSSES_BELOW = 'Crosses Below',
  GREATER_THAN = '>',
  LESS_THAN = '<',
  EQUALS = '=',
  BETWEEN = 'Between'
}

export interface Condition {
  id: string;
  indicator: IndicatorType;
  period: number;
  operator: Operator;
  value: number | string; // Can be a number or another indicator
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  assetClass: AssetClass;
  timeframe: Timeframe;
  entryRules: Condition[];
  exitRules: Condition[];
  stopLossPct: number;
  takeProfitPct: number;
  created: string;
}

export interface BacktestResult {
  id: string;
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  metrics: {
    totalReturnPct: number;
    cagr: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
  };
  equityCurve: { date: string; value: number; drawdown: number }[];
  status: 'running' | 'completed' | 'failed';
}

export interface MarketData {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  lastPrice: number;
  dataAvailable: boolean;
  lastUpdated: string;
}
