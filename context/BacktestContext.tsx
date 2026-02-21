import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Timeframe, Strategy } from '../types';
import { UNIVERSES } from '../constants';
import { DataHealthReport } from '../services/api';

interface BacktestContextType {
    // Core Config
    mode: 'SINGLE' | 'UNIVERSE';
    setMode: (val: 'SINGLE' | 'UNIVERSE') => void;
    segment: 'NSE_EQ' | 'NSE_SME';
    setSegment: (val: 'NSE_EQ' | 'NSE_SME') => void;
    symbol: string;
    setSymbol: (val: string) => void;
    symbolSearchQuery: string;
    setSymbolSearchQuery: (val: string) => void;
    searchResults: any[];
    setSearchResults: (val: any[]) => void;
    selectedInstrument: any | null;
    setSelectedInstrument: (val: any | null) => void;
    isSearching: boolean;
    setIsSearching: (val: boolean) => void;
    universe: string;
    setUniverse: (val: string) => void;
    timeframe: Timeframe;
    setTimeframe: (val: Timeframe) => void;

    // Strategy
    strategyId: string;
    setStrategyId: (val: string) => void;
    customStrategies: Strategy[];
    setCustomStrategies: (val: Strategy[]) => void;
    params: Record<string, number>;
    setParams: (val: Record<string, number>) => void;

    // Dates
    startDate: string;
    setStartDate: (val: string) => void;
    endDate: string;
    setEndDate: (val: string) => void;

    // Settings
    capital: number;
    setCapital: (val: number) => void;
    slippage: number;
    setSlippage: (val: number) => void;
    commission: number;
    setCommission: (val: number) => void;
    showAdvanced: boolean;
    setShowAdvanced: (val: boolean) => void;
    stopLossPct: number;
    setStopLossPct: (val: number) => void;
    takeProfitPct: number;
    setTakeProfitPct: (val: number) => void;
    useTrailingStop: boolean;
    setUseTrailingStop: (val: boolean) => void;
    pyramiding: number;
    setPyramiding: (val: number) => void;
    positionSizing: string;
    setPositionSizing: (val: string) => void;
    positionSizeValue: number;
    setPositionSizeValue: (val: number) => void;

    // Status
    running: boolean;
    setRunning: (val: boolean) => void;
    dataStatus: 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
    setDataStatus: (val: 'IDLE' | 'LOADING' | 'READY' | 'ERROR') => void;
    healthReport: DataHealthReport | null;
    setHealthReport: (val: DataHealthReport | null) => void;

    // Optimization
    isDynamic: boolean;
    setIsDynamic: (val: boolean) => void;
    wfoConfig: { trainWindow: number; testWindow: number };
    setWfoConfig: (val: { trainWindow: number; testWindow: number }) => void;
    autoTuneConfig: { lookbackMonths: number; trials: number; metric: string };
    setAutoTuneConfig: (val: { lookbackMonths: number; trials: number; metric: string }) => void;
    paramRanges: Record<string, { min: number; max: number; step: number }>;
    setParamRanges: (val: Record<string, { min: number; max: number; step: number }>) => void;
    isAutoTuning: boolean;
    setIsAutoTuning: (val: boolean) => void;
    showRanges: boolean;
    setShowRanges: (val: boolean) => void;
    reproducible: boolean;
    setReproducible: (val: boolean) => void;

    // OOS
    top5Trials: any[];
    setTop5Trials: (val: any[]) => void;
    oosResults: any[];
    setOosResults: (val: any[]) => void;
    isOosValidating: boolean;
    setIsOosValidating: (val: boolean) => void;
    fullReportData: any | null;
    setFullReportData: (val: any | null) => void;
    isReportOpen: boolean;
    setIsReportOpen: (val: boolean) => void;
    useLookback: boolean;
    setUseLookback: (val: boolean) => void;
}

const BacktestContext = createContext<BacktestContextType | undefined>(undefined);

export const BacktestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Helper to load from localStorage
    const load = (key: string, def: any) => {
        const stored = localStorage.getItem(`backtest_${key}`);
        if (!stored) return def;
        try { return JSON.parse(stored); } catch { return stored; }
    };

    // States with LocalStorage persistence
    const [segment, setSegment] = useState<'NSE_EQ' | 'NSE_SME'>(() => load('segment', 'NSE_EQ'));
    const [symbol, setSymbol] = useState(() => load('symbol', ''));
    const [timeframe, setTimeframe] = useState<Timeframe>(() => load('timeframe', Timeframe.D1));
    const [startDate, setStartDate] = useState(() => load('startDate', '2023-01-01'));
    const [endDate, setEndDate] = useState(() => load('endDate', '2023-12-31'));
    const [capital, setCapital] = useState(() => load('capital', 100000));
    const [strategyId, setStrategyId] = useState(() => load('strategyId', '1'));
    const [selectedInstrument, setSelectedInstrument] = useState(() => load('selectedInstrument', null));

    // States without persistence (Memory only)
    const [mode, setMode] = useState<'SINGLE' | 'UNIVERSE'>('SINGLE');
    const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [universe, setUniverse] = useState(UNIVERSES[0].id);
    const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);
    const [params, setParams] = useState<Record<string, number>>({});
    const [slippage, setSlippage] = useState(0.05);
    const [commission, setCommission] = useState(20);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [stopLossPct, setStopLossPct] = useState(0);
    const [takeProfitPct, setTakeProfitPct] = useState(0);
    const [useTrailingStop, setUseTrailingStop] = useState(false);
    const [pyramiding, setPyramiding] = useState(1);
    const [positionSizing, setPositionSizing] = useState('Fixed Capital');
    const [positionSizeValue, setPositionSizeValue] = useState(100000);
    const [running, setRunning] = useState(false);
    const [dataStatus, setDataStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
    const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);
    const [isDynamic, setIsDynamic] = useState(false);
    const [wfoConfig, setWfoConfig] = useState({ trainWindow: 12, testWindow: 3 });
    const [autoTuneConfig, setAutoTuneConfig] = useState({ lookbackMonths: 12, trials: 30, metric: 'sharpe' });
    const [paramRanges, setParamRanges] = useState<Record<string, { min: number, max: number, step: number }>>({});
    const [isAutoTuning, setIsAutoTuning] = useState(false);
    const [showRanges, setShowRanges] = useState(false);
    const [reproducible, setReproducible] = useState(false);
    const [top5Trials, setTop5Trials] = useState<any[]>([]);
    const [oosResults, setOosResults] = useState<any[]>([]);
    const [isOosValidating, setIsOosValidating] = useState(false);
    const [fullReportData, setFullReportData] = useState<any | null>(null);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [useLookback, setUseLookback] = useState(false);
    // Save to localStorage effects
    useEffect(() => { localStorage.setItem('backtest_segment', JSON.stringify(segment)); }, [segment]);
    useEffect(() => { localStorage.setItem('backtest_symbol', JSON.stringify(symbol)); }, [symbol]);
    useEffect(() => { localStorage.setItem('backtest_timeframe', JSON.stringify(timeframe)); }, [timeframe]);
    useEffect(() => { localStorage.setItem('backtest_startDate', JSON.stringify(startDate)); }, [startDate]);
    useEffect(() => { localStorage.setItem('backtest_endDate', JSON.stringify(endDate)); }, [endDate]);
    useEffect(() => { localStorage.setItem('backtest_capital', JSON.stringify(capital)); }, [capital]);
    useEffect(() => { localStorage.setItem('backtest_strategyId', JSON.stringify(strategyId)); }, [strategyId]);
    useEffect(() => { localStorage.setItem('backtest_selectedInstrument', JSON.stringify(selectedInstrument)); }, [selectedInstrument]);

    const value = {
        mode, setMode, segment, setSegment, symbol, setSymbol, symbolSearchQuery, setSymbolSearchQuery,
        searchResults, setSearchResults, selectedInstrument, setSelectedInstrument,
        isSearching, setIsSearching, universe, setUniverse, timeframe, setTimeframe,
        strategyId, setStrategyId, customStrategies, setCustomStrategies, params, setParams,
        startDate, setStartDate, endDate, setEndDate, capital, setCapital, slippage, setSlippage,
        commission, setCommission, showAdvanced, setShowAdvanced, running, setRunning,
        dataStatus, setDataStatus, healthReport, setHealthReport, isDynamic, setIsDynamic,
        wfoConfig, setWfoConfig, autoTuneConfig, setAutoTuneConfig, paramRanges, setParamRanges,
        isAutoTuning, setIsAutoTuning, showRanges, setShowRanges, reproducible, setReproducible,
        top5Trials, setTop5Trials, oosResults, setOosResults, isOosValidating, setIsOosValidating,
        stopLossPct, setStopLossPct, takeProfitPct, setTakeProfitPct, useTrailingStop, setUseTrailingStop,
        pyramiding, setPyramiding, positionSizing, setPositionSizing, positionSizeValue, setPositionSizeValue,
        fullReportData, setFullReportData, isReportOpen, setIsReportOpen,
        useLookback, setUseLookback
    };

    return <BacktestContext.Provider value={value}>{children}</BacktestContext.Provider>;
};

export const useBacktestContext = () => {
    const context = useContext(BacktestContext);
    if (!context) throw new Error('useBacktestContext must be used within a BacktestProvider');
    return context;
};
