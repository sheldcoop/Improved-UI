
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
  gamma: number;
  vega: number;
}

export interface OptionStrategy {
  name: string;
  underlying: string;
  spotPrice: number;
  legs: OptionLeg[];
}

export interface Trade {
  id: string;
  entryDate: string;
  exitDate: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  status: 'WIN' | 'LOSS';
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
    avgDrawdownDuration: string;
    winRate: number;
    profitFactor: number;
    kellyCriterion: number;
    totalTrades: number;
    consecutiveLosses: number;
    alpha: number;
    beta: number;
    volatility: number;
    expectancy: number;
  };
  monthlyReturns: { year: number; month: number; returnPct: number }[];
  equityCurve: { date: string; value: number; drawdown: number }[];
  trades: Trade[]; // Added Trade Log
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

// Optimization Types
export interface ParamRange {
  paramName: string;
  min: number;
  max: number;
  step: number;
}

export interface OptimizationResult {
  paramSet: Record<string, number>;
  sharpe: number;
  returnPct: number;
  drawdown: number;
}

export interface WFOResult {
  period: string; // e.g., "2023-Jan to 2023-Mar"
  isOOS: boolean;
  returnPct: number;
  sharpe: number;
}

// Monte Carlo Types
export interface MonteCarloPath {
  id: number;
  values: number[]; // Equity curve points
}

export interface MonteCarloStats {
  var95: number; // Value at Risk 95%
  cvar95: number; // Conditional VaR
  ruinProb: number; // Probability of Ruin
  medianReturn: number;
}

// Paper Trading / Forward Sim Types
export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  pnlPct: number;
  entryTime: string;
  status: 'OPEN' | 'CLOSED';
}

export interface OptionChainItem {
  strike: number;
  cePremium: number;
  pePremium: number;
  ceIv: number;
  peIv: number;
  ceOi: number;
  peOi: number;
}
