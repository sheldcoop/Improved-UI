export enum AssetClass {
  EQUITY = 'EQUITY',
  OPTIONS = 'OPTIONS',
  FUTURES = 'FUTURES'
}

export enum Timeframe {
  M1 = '1m',
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
  VOLUME = 'Volume',
  IV = 'Implied Volatility',
  OI = 'Open Interest',
  PCR = 'PCR'
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
  value: number | string;
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

export interface OptionLeg {
  id: string;
  type: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike: number;
  expiry: string;
  premium: number;
  iv: number;
  delta: number;
  theta: number;
}

export interface OptionStrategy {
  name: string;
  underlying: string;
  spotPrice: number;
  legs: OptionLeg[];
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
    sortinoRatio: number;
    calmarRatio: number;
    maxDrawdownPct: number;
    avgDrawdownDuration: string; // e.g., "14 days"
    winRate: number;
    profitFactor: number;
    kellyCriterion: number;
    totalTrades: number;
    consecutiveLosses: number;
  };
  monthlyReturns: { year: number; month: number; returnPct: number }[];
  equityCurve: { date: string; value: number; drawdown: number }[];
  status: 'running' | 'completed' | 'failed';
}

export interface MarketData {
  symbol: string;
  exchange: 'NSE' | 'BSE' | 'NFO';
  lastPrice: number;
  changePct: number;
  ivPercentile?: number;
  oiChange?: number;
  dataAvailable: boolean;
  lastUpdated: string;
}
