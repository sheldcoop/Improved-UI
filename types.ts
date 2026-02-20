
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
  MACD_SIGNAL = 'MACD Signal',
  BOL_UPPER = 'Bollinger Upper',
  BOL_LOWER = 'Bollinger Lower',
  BOL_MID = 'Bollinger Mid',
  SUPERTREND = 'SuperTrend',
  ATR = 'ATR',
  CLOSE = 'Close Price',
  OPEN = 'Open Price',
  HIGH = 'High Price',
  LOW = 'Low Price',
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

export enum Logic {
  AND = 'AND',
  OR = 'OR'
}

// Comparison: Can be a static number OR another Indicator
export interface ComparisonValue {
  type: 'STATIC' | 'INDICATOR';
  value: number; // For static
  indicator?: IndicatorType; // For indicator comparison
  period?: number;
}

export interface Condition {
  id: string;
  // Left Side
  indicator: IndicatorType;
  period: number;
  timeframe?: Timeframe; // MTF Support: If undefined, uses Strategy Timeframe
  multiplier?: number; // e.g., 2.0 * ATR

  // Logic
  operator: Operator;

  // Right Side (Fixed value or another indicator)
  compareType: 'STATIC' | 'INDICATOR';
  value: number;
  rightIndicator?: IndicatorType;
  rightPeriod?: number;
  rightTimeframe?: Timeframe; // MTF Support for right side
}

export interface RuleGroup {
  id: string;
  type: 'GROUP';
  logic: Logic; // AND / OR
  conditions: (Condition | RuleGroup)[]; // Recursive
}

export enum PositionSizeMode {
  FIXED_CAPITAL = 'Fixed Capital',
  PERCENT_EQUITY = '% of Equity',
  RISK_BASED = 'Risk Based (ATR)'
}

export enum RankingMethod {
  NONE = 'No Ranking',
  ROC = 'Rate of Change',
  RSI = 'Relative Strength',
  VOLATILITY = 'Volatility',
  VOLUME = 'Volume'
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  assetClass: AssetClass;
  timeframe: Timeframe;

  // Mode: Visual vs Code
  mode: 'VISUAL' | 'CODE';
  pythonCode?: string;

  // Visual Rules (Root Group)
  entryLogic: RuleGroup;
  exitLogic: RuleGroup;

  // Advanced Settings
  startTime?: string; // "09:30"
  endTime?: string;   // "15:00"
  pyramiding: number; // Max entries

  // Risk & Sizing
  stopLossPct: number;
  takeProfitPct: number;
  useTrailingStop: boolean;
  positionSizing: PositionSizeMode;
  positionSizeValue: number; // e.g., 1 (lot) or 5 (%) or 100000 (cash)

  // Universe Ranking (Feature #6)
  rankingMethod?: RankingMethod;
  rankingTopN?: number; // Select top N stocks

  // Dynamic Strategy Params (Feature #7)
  params?: Record<string, any>;

  created: string;
}

export interface StrategyParam {
  name: string;
  type: 'int' | 'float' | 'string' | 'bool';
  default: any;
  description?: string;
}

export interface StrategyPreset {
  id: string;
  name: string;
  description: string;
  params: StrategyParam[];
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
    alerts?: string[];
  };
  monthlyReturns: { year: number; month: number; returnPct: number }[];
  equityCurve: { date: string; value: number; drawdown: number }[];
  trades: Trade[];
  isDynamic?: boolean;
  paramHistory?: { start: string; end: string; params: Record<string, number>; usingFallback?: boolean }[];
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
  trades: number;
  winRate: number;
  score: number;
}

export interface WFOResult {
  period: string; // e.g., "Run 1 (Train)" or "Run 1 (Test)"
  type: 'TRAIN' | 'TEST';
  params: string;
  returnPct: number;
  sharpe: number;
  drawdown: number;
  trades: number;
  winRate: number;
}

export type StrategyId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

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
