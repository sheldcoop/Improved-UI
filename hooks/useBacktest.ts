import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UNIVERSES } from '../constants';
import { validateMarketData, DataHealthReport, fetchStrategies, runBacktest } from '../services/api';
import { Timeframe, Strategy } from '../types';
import { fetchClient } from '../services/http';
import { logActiveRun, logDataHealth, logOptunaResults, logWFOBreakdown, logAlert } from '../components/DebugConsole';

// Debounce helper
const useDebounce = (value: string, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// Search instruments API
const searchInstruments = async (segment: string, query: string) => {
    return fetchClient<Array<{ symbol: string; display_name: string; security_id: string; instrument_type: string }>>(`/market/instruments?segment=${segment}&q=${encodeURIComponent(query)}`);
};

// Run backtest with Dhan API
const runBacktestWithDhan = async (payload: {
    instrument_details: {
        security_id: string;
        symbol: string;
        exchange_segment: string;
        instrument_type: string;
    };
    parameters: {
        timeframe: string;
        start_date: string;
        end_date: string;
        initial_capital: number;
        strategy_logic: {
            name: string;
            [key: string]: any;
        };
    };
}) => {
    return fetchClient<{
        status: string;
        data_summary?: {
            total_candles: number;
            start_date: string;
            end_date: string;
            open_price: number;
            close_price: number;
            high: number;
            low: number;
            avg_volume: number;
        };
        instrument?: {
            symbol: string;
            security_id: string;
            timeframe: string;
        };
        note?: string;
    }>('/market/backtest/run', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
};

export const useBacktest = () => {
    const navigate = useNavigate();
    const [running, setRunning] = useState(false);

    // Core Config
    const [mode, setMode] = useState<'SINGLE' | 'UNIVERSE'>('SINGLE');
    const [segment, setSegment] = useState<'NSE_EQ' | 'NSE_SME'>('NSE_EQ');
    const [symbol, setSymbol] = useState('');
    const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Array<{ symbol: string; display_name: string; security_id: string; instrument_type: string }>>([]);
    const [selectedInstrument, setSelectedInstrument] = useState<{ symbol: string; display_name: string; security_id: string; instrument_type: string } | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [universe, setUniverse] = useState(UNIVERSES[0].id);
    const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.D1);

    // Strategy State
    const [strategyId, setStrategyId] = useState('1');
    const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);

    // Date Range
    const [startDate, setStartDate] = useState('2023-01-01');
    const [endDate, setEndDate] = useState('2023-12-31');

    // Dynamic Strategy Parameters (Feature A)
    const [params, setParams] = useState<Record<string, number>>({});

    // Splitter State (Feature C)
    const [splitRatio, setSplitRatio] = useState(80); // 80% Train, 20% Test

    // Advanced Settings State
    const [capital, setCapital] = useState(100000);
    const [slippage, setSlippage] = useState(0.05);
    const [commission, setCommission] = useState(20);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // New Data Loading State (Improvement 1 & 2)
    const [dataStatus, setDataStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
    const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);

    // --- Optimization State (Optuna / WFO) ---
    const [isDynamic, setIsDynamic] = useState(false);
    const [wfoConfig, setWfoConfig] = useState({ trainWindow: 12, testWindow: 3 });
    const [autoTuneConfig, setAutoTuneConfig] = useState({ lookbackMonths: 12, trials: 30, metric: 'sharpe' });
    const [paramRanges, setParamRanges] = useState<Record<string, { min: number, max: number, step: number }>>({});
    const [isAutoTuning, setIsAutoTuning] = useState(false);
    const [showRanges, setShowRanges] = useState(false);
    const [reproducible, setReproducible] = useState(false);

    // Auto-Calculate WFO Windows when dates change
    useEffect(() => {
        if (!isDynamic) return;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const totalMonths = Math.round(diffTime / (1000 * 60 * 60 * 24 * 30.44));

        let newTrain = 12;
        let newTest = 3;

        if (totalMonths < 12) { newTrain = 3; newTest = 1; }
        else if (totalMonths < 24) { newTrain = 6; newTest = 2; }
        else if (totalMonths < 36) { newTrain = 9; newTest = 3; }

        setWfoConfig({ trainWindow: newTrain, testWindow: newTest });
    }, [startDate, endDate, isDynamic]);

    // Load Strategies on Mount
    useEffect(() => {
        const loadStrats = async () => {
            try {
                const strats = await fetchStrategies() as unknown as Strategy[];
                setCustomStrategies(strats);
            } catch (e) {
                console.error("Failed to load strategies", e);
            }
        };
        loadStrats();
    }, []);

    // Initialize defaults based on strategy selection
    useEffect(() => {
        if (strategyId === '1') { // RSI
            setParams({ period: 14, lower: 30, upper: 70 });
            setParamRanges({
                period: { min: 5, max: 30, step: 1 },
                lower: { min: 10, max: 40, step: 1 },
                upper: { min: 60, max: 90, step: 1 }
            });
        } else if (strategyId === '3') { // SMA
            setParams({ fast: 10, slow: 50 });
            setParamRanges({
                fast: { min: 5, max: 50, step: 1 },
                slow: { min: 20, max: 200, step: 1 }
            });
        } else {
            // Clear params for custom strategies
            setParams({});
            setParamRanges({});
        }
        setShowRanges(false);
    }, [strategyId]);

    // Reset data status when key inputs change
    useEffect(() => {
        setDataStatus('IDLE');
        setHealthReport(null);
    }, [symbol, universe, timeframe, startDate, endDate]);

    // Debounced search effect
    const debouncedSearchQuery = useDebounce(symbolSearchQuery, 300);

    useEffect(() => {
        if (mode !== 'SINGLE' || !debouncedSearchQuery || debouncedSearchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const doSearch = async () => {
            setIsSearching(true);
            try {
                const results = await searchInstruments(segment, debouncedSearchQuery);
                setSearchResults(results);
            } catch (e) {
                console.error('Search failed:', e);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        doSearch();
    }, [debouncedSearchQuery, segment, mode]);

    // Calculate Split Date
    const splitDateString = useMemo(() => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (isNaN(diffDays)) return '-';

        const splitDayIndex = Math.floor(diffDays * (splitRatio / 100));
        const splitDate = new Date(start);
        splitDate.setDate(start.getDate() + splitDayIndex);
        return splitDate.toISOString().split('T')[0];
    }, [startDate, endDate, splitRatio]);

    const handleLoadData = async () => {
        setDataStatus('LOADING');
        try {
            const target = mode === 'SINGLE' ? symbol : universe;

            // Calculate extended from_date (Lookback + Backtest)
            const lookbackMonths = autoTuneConfig.lookbackMonths;
            const startDt = new Date(startDate);
            const extendedDt = new Date(startDt);
            extendedDt.setMonth(startDt.getMonth() - lookbackMonths);
            const extendedFromDate = extendedDt.toISOString().split('T')[0];

            console.log(`[Unified Load] Fetching ${lookbackMonths}m lookback + backtest range: ${extendedFromDate} to ${endDate}`);

            logActiveRun({
                type: 'DATA_LOADING',
                strategyName: 'Market Data Validator',
                symbol: target,
                timeframe,
                startDate: extendedFromDate,
                endDate: endDate,
                status: 'running'
            });

            const report = await validateMarketData(target, timeframe, extendedFromDate, endDate);
            setHealthReport(report);
            logDataHealth(report);

            if (report.status === 'POOR' || report.status === 'CRITICAL') {
                logAlert([{
                    type: 'warning',
                    msg: `Data health is ${report.status} for ${target}. ${report.missingCandles} candles missing.`,
                    timestamp: new Date().toLocaleTimeString()
                }]);
            }

            setDataStatus('READY');
        } catch (e) {
            console.error("Data load failed", e);
            setDataStatus('ERROR');
            logAlert([{
                type: 'error',
                msg: `Failed to load data for ${mode === 'SINGLE' ? symbol : universe}: ${e}`,
                timestamp: new Date().toLocaleTimeString()
            }]);
        } finally {
            logActiveRun(null);
        }
    };

    const handleAutoTune = async () => {
        if (!selectedInstrument) {
            alert("Please select a symbol first.");
            return;
        }

        if (dataStatus !== 'READY') {
            alert("Optimization requires pre-loaded data. Please click 'Load Market Data' first to fetch the lookback range.");
            return;
        }

        if (!showRanges) {
            setShowRanges(true);
            return;
        }

        setIsAutoTuning(true);
        logActiveRun({
            type: 'AUTO_TUNING',
            strategyName: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy',
            symbol: selectedInstrument.symbol,
            timeframe,
            startDate,
            endDate,
            status: 'running'
        });

        try {
            const result = await fetchClient<{ bestParams: Record<string, number>, score: number, period: string, grid?: any[] }>('/optimization/auto-tune', {
                method: 'POST',
                body: JSON.stringify({
                    symbol: selectedInstrument.symbol,
                    strategyId: strategyId,
                    ranges: paramRanges,
                    startDate: startDate,
                    lookbackMonths: autoTuneConfig.lookbackMonths,
                    scoringMetric: autoTuneConfig.metric,
                    reproducible: reproducible
                })
            });
            if (result.bestParams) {
                setParams(result.bestParams);
                logOptunaResults(result.grid || []);
                logActiveRun(null);
                setShowRanges(false);
            }
        } catch (e) {
            console.error("Auto-tune failed", e);
            alert("Auto-tune failed. Check logs.");
        } finally {
            setIsAutoTuning(false);
            logActiveRun(null);
        }
    };

    const handleRun = async () => {
        if (dataStatus !== 'READY') {
            alert("Please load and validate market data first.");
            return;
        }

        if (mode === 'SINGLE' && !selectedInstrument) {
            alert("Please select a symbol from the search results.");
            return;
        }

        setRunning(true);
        logActiveRun({
            type: isDynamic ? 'WALK_FORWARD_OPTIMIZATION' : 'SINGLE_BACKTEST',
            strategyName: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy',
            symbol: mode === 'SINGLE' ? selectedInstrument?.symbol || symbol : universe,
            timeframe,
            startDate,
            endDate,
            params,
            status: 'running'
        });

        try {
            if (isDynamic && mode === 'SINGLE' && selectedInstrument) {
                // Path 1: Dynamic WFO Backtest
                const result = await fetchClient<any>('/optimization/wfo', {
                    method: 'POST',
                    body: JSON.stringify({
                        symbol: selectedInstrument.symbol,
                        strategyId: strategyId,
                        ranges: paramRanges,
                        wfoConfig: {
                            ...wfoConfig,
                            startDate,
                            endDate,
                            scoringMetric: autoTuneConfig.metric,
                            initial_capital: capital
                        },
                        reproducible: reproducible,
                        fullResults: true
                    })
                });

                if (result && !result.error) {
                    if (result.wfo) logWFOBreakdown(result.wfo);
                    logActiveRun(null);
                    navigate('/results', { state: { result } });
                } else {
                    alert("Dynamic Backtest Failed: " + (result?.error || "Unknown error"));
                    logActiveRun(null);
                }
            } else if (mode === 'SINGLE' && selectedInstrument) {
                // Path 2: Standard Dhan-based Single Backtest
                const timeframeMap: Record<string, string> = {
                    [Timeframe.M1]: '1m', [Timeframe.M5]: '5m', [Timeframe.M15]: '15m',
                    [Timeframe.H1]: '1h', [Timeframe.D1]: '1d'
                };

                const result = await runBacktestWithDhan({
                    instrument_details: {
                        security_id: selectedInstrument.security_id,
                        symbol: selectedInstrument.symbol,
                        exchange_segment: 'NSE_EQ',
                        instrument_type: selectedInstrument.instrument_type
                    },
                    parameters: {
                        timeframe: timeframeMap[timeframe] || '1d',
                        start_date: startDate,
                        end_date: endDate,
                        initial_capital: capital,
                        strategy_logic: {
                            id: strategyId,
                            name: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy',
                            ...params
                        }
                    }
                });

                if (result) {
                    navigate('/results', { state: { result } });
                }
            } else {
                // Path 3: Fallback for Universe mode
                const config: any = {
                    capital, slippage, commission, ...params,
                    splitDate: splitDateString,
                    trainTestSplit: splitRatio
                };

                if (mode === 'UNIVERSE') {
                    config.universe = universe;
                }

                const result = await runBacktest(strategyId, mode === 'SINGLE' ? symbol : universe, config);
                if (result) result.timeframe = timeframe;
                navigate('/results', { state: { result } });
            }
        } catch (e) {
            alert("Backtest Failed: " + e);
            logActiveRun(null);
        } finally {
            setRunning(false);
        }
    };

    return {
        state: {
            running, mode, segment, symbol, symbolSearchQuery, searchResults, selectedInstrument,
            isSearching, universe, timeframe, strategyId, customStrategies, startDate, endDate,
            params, splitRatio, capital, slippage, commission, showAdvanced, dataStatus, healthReport,
            isDynamic, wfoConfig, autoTuneConfig, paramRanges, isAutoTuning, showRanges, reproducible,
            splitDateString
        },
        setters: {
            setRunning, setMode, setSegment, setSymbol, setSymbolSearchQuery, setSearchResults,
            setSelectedInstrument, setIsSearching, setUniverse, setTimeframe, setStrategyId, setCustomStrategies,
            setStartDate, setEndDate, setParams, setSplitRatio, setCapital, setSlippage, setCommission,
            setShowAdvanced, setDataStatus, setHealthReport, setIsDynamic, setWfoConfig, setAutoTuneConfig,
            setParamRanges, setIsAutoTuning, setShowRanges, setReproducible
        },
        handlers: {
            handleLoadData, handleAutoTune, handleRun
        }
    };
};
