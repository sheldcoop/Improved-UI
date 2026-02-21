import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UNIVERSES } from '../constants';
import { validateMarketData, DataHealthReport, fetchStrategies, runBacktest } from '../services/api';
import { delay } from '../services/http';
import { Timeframe, Strategy } from '../types';
import { fetchClient } from '../services/http';
import { logActiveRun, logDataHealth, logOptunaResults, logWFOBreakdown, logAlert } from '../components/DebugConsole';
import { useBacktestContext } from '../context/BacktestContext';

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

// Run backtest with Dhan API; include graceful fallback so the UI still works
// even if the backend is unreachable.  This mirrors the logic used in
// services/backtestService.runBacktest which uses executeWithFallback.
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
    // reuse executeWithFallback from http.ts; we import it inline here to avoid
    // circular dependency with services/api (which also imports http).  Since
    // this file already imports fetchClient, we can copy the helper code.

    const executeWithFallback = async <T>(
        endpoint: string,
        options: RequestInit | undefined,
        mockFn: () => Promise<T>
    ): Promise<T> => {
        const { CONFIG } = await import('../config');
        if (!CONFIG.USE_MOCK_DATA) {
            try {
                return await fetchClient<T>(endpoint, options);
            } catch (error) {
                console.warn(`[Auto-Fallback] Backend ${endpoint} unreachable. Using Mock Data.`);
            }
        }
        return mockFn();
    };

    return executeWithFallback<{
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
    }>(
        '/market/backtest/run',
        { method: 'POST', body: JSON.stringify(payload) },
        async () => {
            // comprehensive mock fallback adhering to BacktestResult interface
            await delay(1500);
            console.warn('Mock fallback for runBacktestWithDhan');

            const now = new Date();
            const startDt = new Date(payload.parameters.start_date);
            const endDt = new Date(payload.parameters.end_date);

            // simple equity curve with a flat line
            const equityCurve = [] as Array<{ date: string; value: number; drawdown: number }>;
            let iter = new Date(startDt);
            while (iter <= endDt) {
                equityCurve.push({ date: iter.toISOString().split('T')[0], value: 100000, drawdown: 0 });
                iter.setDate(iter.getDate() + 1);
            }

            const backtestResult: any = {
                id: `mock_${Math.random().toString(36).substr(2, 6)}`,
                strategyName: payload.parameters.strategy_logic?.name || 'Mock Strategy',
                symbol: payload.instrument_details.symbol,
                timeframe: payload.parameters.timeframe,
                startDate: payload.parameters.start_date,
                endDate: payload.parameters.end_date,
                metrics: {
                    totalReturnPct: 0,
                    cagr: 0,
                    sharpeRatio: 0,
                    sortinoRatio: 0,
                    calmarRatio: 0,
                    maxDrawdownPct: 0,
                    avgDrawdownDuration: '0d',
                    winRate: 0,
                    profitFactor: 0,
                    kellyCriterion: 0,
                    totalTrades: 0,
                    consecutiveLosses: 0,
                    alpha: 0,
                    beta: 0,
                    volatility: 0,
                    expectancy: 0
                },
                monthlyReturns: [],
                equityCurve,
                trades: [],
                status: 'completed'
            };
            return backtestResult;
        });
};

export const useBacktest = () => {
    const navigate = useNavigate();
    const {
        running, setRunning, mode, setMode, segment, setSegment, symbol, setSymbol,
        symbolSearchQuery, setSymbolSearchQuery, searchResults, setSearchResults,
        selectedInstrument, setSelectedInstrument, isSearching, setIsSearching,
        universe, setUniverse, timeframe, setTimeframe, strategyId, setStrategyId,
        customStrategies, setCustomStrategies, startDate, setStartDate, endDate, setEndDate,
        params, setParams, capital, setCapital, slippage, setSlippage,
        commission, setCommission, showAdvanced, setShowAdvanced, dataStatus, setDataStatus,
        healthReport, setHealthReport, isDynamic, setIsDynamic, wfoConfig, setWfoConfig,
        autoTuneConfig, setAutoTuneConfig, paramRanges, setParamRanges, isAutoTuning, setIsAutoTuning,
        showRanges, setShowRanges, reproducible, setReproducible, top5Trials, setTop5Trials,
        oosResults, setOosResults, isOosValidating, setIsOosValidating,
        stopLossPct, setStopLossPct, takeProfitPct, setTakeProfitPct, useTrailingStop, setUseTrailingStop,
        pyramiding, setPyramiding, positionSizing, setPositionSizing, positionSizeValue, setPositionSizeValue
    } = useBacktestContext();

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

        const timeframeMap: Record<string, string> = {
            [Timeframe.M1]: '1m', [Timeframe.M5]: '5m', [Timeframe.M15]: '15m',
            [Timeframe.H1]: '1h', [Timeframe.D1]: '1d'
        };

        try {
            const result = await fetchClient<{ bestParams: Record<string, number>, score: number, period: string, grid?: any[] }>('/optimization/auto-tune', {
                method: 'POST',
                body: JSON.stringify({
                    symbol: selectedInstrument.symbol,
                    strategyId: strategyId,
                    ranges: paramRanges,
                    timeframe: timeframeMap[timeframe] || '1d',
                    startDate: startDate,
                    lookbackMonths: autoTuneConfig.lookbackMonths,
                    scoringMetric: autoTuneConfig.metric,
                    reproducible: reproducible,
                    config: {
                        initial_capital: capital,
                        slippage: slippage,
                        commission: commission,
                        stopLossPct,
                        takeProfitPct,
                        useTrailingStop,
                        pyramiding,
                        positionSizing,
                        positionSizeValue
                    }
                })
            });
            if (result.bestParams) {
                setParams(result.bestParams);
                const sortedGrid = result.grid || [];
                logOptunaResults(sortedGrid);
                setTop5Trials(sortedGrid.slice(0, 5)); // Store top 5 for OOS validation
                setOosResults([]); // Reset previous OOS results
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
                    if (result.grid) logOptunaResults(result.grid);
                    logActiveRun(null);

                    // Inject properties required by the Results page
                    result.timeframe = timeframe;
                    result.symbol = selectedInstrument.symbol;
                    result.strategyName = strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy';

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
                            stopLossPct,
                            takeProfitPct,
                            useTrailingStop,
                            pyramiding,
                            positionSizing,
                            positionSizeValue,
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
                    capital, slippage, commission, ...params
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

    const handleOOSValidation = async () => {
        if (!selectedInstrument || top5Trials.length === 0) {
            alert("Please run Auto-Tune first to generate Top 5 Parameters.");
            return;
        }

        const timeframeMap: Record<string, string> = {
            [Timeframe.M1]: '1m', [Timeframe.M5]: '5m', [Timeframe.M15]: '15m',
            [Timeframe.H1]: '1h', [Timeframe.D1]: '1d'
        };

        setIsOosValidating(true);
        try {
            const result = await fetchClient<any[]>('/optimization/oos-validate', {
                method: 'POST',
                body: JSON.stringify({
                    symbol: selectedInstrument.symbol,
                    strategyId: strategyId,
                    paramSets: top5Trials.map(t => t.paramSet),
                    timeframe: timeframeMap[timeframe] || '1d',
                    startDate,
                    endDate,
                    config: {
                        initial_capital: capital,
                        slippage: slippage,
                        commission: commission,
                        stopLossPct,
                        takeProfitPct,
                        useTrailingStop,
                        pyramiding,
                        positionSizing,
                        positionSizeValue
                    }
                })
            });

            if (Array.isArray(result) && result.length > 0) {
                // Pre-process results to include timeframe, symbol, and strategyName for the Results page
                const formattedResults = result.map(res => ({
                    ...res,
                    timeframe,
                    symbol: selectedInstrument.symbol,
                    strategyName: strategyId === '1' ? 'RSI Mean Reversion' : strategyId === '3' ? 'Moving Average Crossover' : 'Custom Strategy'
                }));
                // Route to results page with the array of OOS validations
                navigate('/results', { state: { result: formattedResults, isOOSArray: true } });
            } else {
                alert("OOS Validation failed to return data array.");
            }
        } catch (e: any) {
            console.error("OOS Validation error", e);
            alert("OOS Validation Failed: " + (e.message || e));
        } finally {
            setIsOosValidating(false);
        }
    };

    return {
        state: {
            running, mode, segment, symbol, symbolSearchQuery, searchResults, selectedInstrument,
            isSearching, universe, timeframe, strategyId, customStrategies, startDate, endDate,
            params, capital, slippage, commission, showAdvanced, dataStatus, healthReport,
            isDynamic, wfoConfig, autoTuneConfig, paramRanges, isAutoTuning, showRanges, reproducible,
            top5Trials, oosResults, isOosValidating,
            stopLossPct, takeProfitPct, useTrailingStop, pyramiding, positionSizing, positionSizeValue
        },
        setters: {
            setRunning, setMode, setSegment, setSymbol, setSymbolSearchQuery, setSearchResults,
            setSelectedInstrument, setIsSearching, setUniverse, setTimeframe, setStrategyId, setCustomStrategies,
            setStartDate, setEndDate, setParams, setCapital, setSlippage, setCommission,
            setShowAdvanced, setDataStatus, setHealthReport, setIsDynamic, setWfoConfig, setAutoTuneConfig,
            setParamRanges, setIsAutoTuning, setShowRanges, setReproducible, setTop5Trials, setOosResults,
            setStopLossPct, setTakeProfitPct, setUseTrailingStop, setPyramiding, setPositionSizing, setPositionSizeValue
        },
        handlers: {
            handleLoadData, handleAutoTune, handleRun, handleOOSValidation
        }
    };
};
