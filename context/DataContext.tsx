/**
 * DataContext — owns all market-data and instrument selection state.
 *
 * Separated from the monolithic BacktestContext so that symbol / date / status
 * changes only re-render components that actually consume data-related state
 * (MarketDataSelector, DateRangePicker, HealthReportCard, useDataLoader).
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Timeframe } from '../types';
import { DataHealthReport } from '../services/api';

export interface DataContextType {
    // Instrument selection
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

    // Dates
    startDate: string;
    setStartDate: (val: string) => void;
    endDate: string;
    setEndDate: (val: string) => void;

    // Lookback
    useLookback: boolean;
    setUseLookback: (val: boolean) => void;
    lookbackMonths: number;
    setLookbackMonths: (val: number) => void;

    // Data loading status
    dataStatus: 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
    setDataStatus: (val: 'IDLE' | 'LOADING' | 'READY' | 'ERROR') => void;
    healthReport: DataHealthReport | null;
    setHealthReport: (val: DataHealthReport | null) => void;
    fullReportData: any | null;
    setFullReportData: (val: any | null) => void;
    isReportOpen: boolean;
    setIsReportOpen: (val: boolean) => void;
    isFetchingData: boolean;
    setIsFetchingData: (val: boolean) => void;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

const load = (key: string, def: any) => {
    const stored = localStorage.getItem(`backtest_${key}`);
    if (!stored) return def;
    try { return JSON.parse(stored); } catch { return stored; }
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<'SINGLE' | 'UNIVERSE'>('SINGLE');
    const [segment, setSegment] = useState<'NSE_EQ' | 'NSE_SME'>(() => load('segment', 'NSE_EQ'));
    const [symbol, setSymbol] = useState<string>(() => load('symbol', ''));
    const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedInstrument, setSelectedInstrument] = useState<any | null>(() => load('selectedInstrument', null));
    const [isSearching, setIsSearching] = useState(false);
    const [universe, setUniverse] = useState('NIFTY50');
    const [timeframe, setTimeframe] = useState<Timeframe>(() => load('timeframe', Timeframe.D1));
    const [startDate, setStartDate] = useState<string>(() => load('startDate', '2023-01-01'));
    const [endDate, setEndDate] = useState<string>(() => load('endDate', '2023-12-31'));
    const [useLookback, setUseLookback] = useState(false);
    const [lookbackMonths, setLookbackMonths] = useState(12);
    const [dataStatus, setDataStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>(() => load('dataStatus', 'IDLE'));
    const [healthReport, setHealthReport] = useState<DataHealthReport | null>(() => load('healthReport', null));
    const [fullReportData, setFullReportData] = useState<any | null>(() => load('fullReportData', null));
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isFetchingData, setIsFetchingData] = useState(false);

    // Persistence
    useEffect(() => { localStorage.setItem('backtest_segment', JSON.stringify(segment)); }, [segment]);
    useEffect(() => { localStorage.setItem('backtest_symbol', JSON.stringify(symbol)); }, [symbol]);
    useEffect(() => { localStorage.setItem('backtest_timeframe', JSON.stringify(timeframe)); }, [timeframe]);
    useEffect(() => { localStorage.setItem('backtest_startDate', JSON.stringify(startDate)); }, [startDate]);
    useEffect(() => { localStorage.setItem('backtest_endDate', JSON.stringify(endDate)); }, [endDate]);
    useEffect(() => { localStorage.setItem('backtest_selectedInstrument', JSON.stringify(selectedInstrument)); }, [selectedInstrument]);
    useEffect(() => { localStorage.setItem('backtest_healthReport', JSON.stringify(healthReport)); }, [healthReport]);
    useEffect(() => { localStorage.setItem('backtest_fullReportData', JSON.stringify(fullReportData)); }, [fullReportData]);
    useEffect(() => { localStorage.setItem('backtest_dataStatus', JSON.stringify(dataStatus)); }, [dataStatus]);

    // Restore READY status if cached report exists
    useEffect(() => {
        if (dataStatus === 'IDLE' && fullReportData) {
            setDataStatus('READY');
        }
    }, [dataStatus, fullReportData]);

    const value: DataContextType = {
        mode, setMode, segment, setSegment, symbol, setSymbol,
        symbolSearchQuery, setSymbolSearchQuery, searchResults, setSearchResults,
        selectedInstrument, setSelectedInstrument, isSearching, setIsSearching,
        universe, setUniverse, timeframe, setTimeframe,
        startDate, setStartDate, endDate, setEndDate,
        useLookback, setUseLookback, lookbackMonths, setLookbackMonths,
        dataStatus, setDataStatus, healthReport, setHealthReport,
        fullReportData, setFullReportData, isReportOpen, setIsReportOpen,
        isFetchingData, setIsFetchingData,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useDataContext = (): DataContextType => {
    const ctx = useContext(DataContext);
    if (!ctx) throw new Error('useDataContext must be used within a DataProvider');
    return ctx;
};
