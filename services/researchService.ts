/**
 * researchService.ts — API service for the Research Lab.
 *
 * Service layer for calling the backend research analysis endpoint.
 * Components NEVER call fetch directly (Rule #13).
 */

import { fetchClient } from './http';

export interface ResearchRequest {
    symbol: string;
    startDate: string;
    endDate: string;
    timeframe?: string;
    correlationSymbols?: string[];
}

export interface ProfileData {
    meanDailyReturn: number;
    annualizedReturn: number;
    stdDaily: number;
    annualizedVolatility: number;
    skewness: number;
    kurtosis: number;
    var95: number;
    var99: number;
    cvar95: number;
    sharpeRatio: number;
    autocorrelation: Record<string, number | null>;
    hurstExponent: number | null;
    maxDrawdownPct: number;
    maxDrawdownDays: number | null;
    drawdownPeakDate: string;
    drawdownTroughDate: string;
    beta: number | null;
    rangeHigh: number;
    rangeLow: number;
    currentPrice: number;
    totalDays: number;
}

export interface SeasonalityData {
    monthlyHeatmap: { year: number; month: number; returnPct: number }[];
    monthlyAverage: { month: number; avgReturnPct: number; count: number }[];
    dayOfWeek: { day: string; avgReturnPct: number }[];
    pctFrom52WeekHigh: number;
    pctFrom52WeekLow: number;
    bestMonth: { year: number; month: number; returnPct: number } | null;
    worstMonth: { year: number; month: number; returnPct: number } | null;
    streaks: {
        maxWinStreak: number;
        maxLossStreak: number;
        currentStreak: number;
        currentStreakType: string;
    };
}

export interface DistributionData {
    histogram: { binStart: number; binEnd: number; count: number }[];
    normalMu: number;
    normalSigma: number;
    qqPlot: { theoretical: number; sample: number }[];
    jarqueBera: { statistic: number; pValue: number; isNormal: boolean };
    shapiroWilk: { statistic: number | null; pValue: number | null; isNormal: boolean | null };
    andersonDarling: { statistic: number; criticalValues: Record<string, number> };
    confidenceIntervals: {
        ci68: [number, number];
        ci95: [number, number];
        ci99: [number, number];
    };
    sampleSize: number;
}

export interface GarchData {
    fitted: boolean;
    error?: string;
    omega?: number;
    alpha?: number;
    beta?: number;
    persistence?: number;
    halfLife?: number | null;
    conditionalVolSeries?: { date: string; condVol: number }[];
    currentCondVol?: number;
    garchVaR95?: number;
    historicalVaR95?: number;
    logLikelihood?: number;
    aic?: number;
    bic?: number;
}

export interface AcfPacfData {
    computed: boolean;
    error?: string;
    acf?: { lag: number; value: number }[];
    pacf?: { lag: number; value: number }[];
    confidenceBound?: number;
    ljungBox?: { statistic: number; pValue: number; hasArchEffects: boolean };
}

export interface RollingVolData {
    series: { date: string; vol20d: number; vol60d: number | null }[];
    currentVol20d?: number;
    currentVol60d?: number | null;
    volPercentileRank?: number;
    volRegime?: string;
    error?: string;
}

export interface RegimeData {
    fitted: boolean;
    error?: string;
    nStates?: number;
    states?: { id: number; label: string; annualizedReturn: number; annualizedVol: number }[];
    transitionMatrix?: number[][];
    currentRegime?: number;
    currentRegimeLabel?: string;
    currentProbability?: number;
    timeline?: { date: string; regime: number; probability: number }[];
}

export interface CorrelationData {
    computed: boolean;
    message?: string;
    error?: string;
    symbols?: string[];
    matrix?: number[][];
    rollingCorrelation?: Record<string, { date: string; correlation: number }[]>;
}

export interface AdvancedData {
    garch: GarchData;
    acfPacf: AcfPacfData;
    rollingVol: RollingVolData;
    regimes: RegimeData;
    correlation: CorrelationData;
}

export interface ResearchResponse {
    status: string;
    symbol: string;
    startDate: string;
    endDate: string;
    timeframe: string;
    bars: number;
    profile: ProfileData;
    seasonality: SeasonalityData;
    distribution: DistributionData;
    advanced: AdvancedData;
}

/**
 * Run quant research analysis on a stock.
 *
 * @param req - Analysis request parameters
 * @returns Full research response with profile, seasonality, distribution, and advanced
 * @throws Error if backend returns an error
 */
export const analyzeStock = async (req: ResearchRequest): Promise<ResearchResponse> => {
    return fetchClient<ResearchResponse>('/research/analyze', {
        method: 'POST',
        body: JSON.stringify({
            symbol: req.symbol,
            startDate: req.startDate,
            endDate: req.endDate,
            timeframe: req.timeframe || '1d',
            correlationSymbols: req.correlationSymbols || [],
        }),
    });
};
