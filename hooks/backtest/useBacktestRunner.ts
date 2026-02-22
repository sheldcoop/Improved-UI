import { useNavigate } from 'react-router-dom';
import { useBacktestContext } from '../../context/BacktestContext';
import { runBacktest, runOOSValidation } from '../../services/api';
import { fetchClient } from '../../services/http';
import { logActiveRun, logOptunaResults, logWFOBreakdown } from '../../components/DebugConsole';
import { runBacktestWithDhan } from '../../services/backtestInternal';
import { Timeframe } from '../../types';

const TIMEFRAME_MAP: Record<string, string> = {
    [Timeframe.M1]: '1m',
    [Timeframe.M5]: '5m',
    [Timeframe.M15]: '15m',
    [Timeframe.H1]: '1h',
    [Timeframe.D1]: '1d',
};

const statsFreqFromTimeframe = (tf: string): string => {
    if (tf === '1d') return '1D';
    if (tf === '1h') return '1h';
    if (tf === '15m') return '15m';
    if (tf === '5m') return '5m';
    return '1D';
};

/**
 * Handles backtest execution:
 * - handleRun: runs single/universe/WFO backtest depending on current mode
 * - handleOOSValidation: runs out-of-sample validation with top 5 trials
 */
export const useBacktestRunner = () => {
    const navigate = useNavigate();
    const {
        running, setRunning,
        mode, symbol, universe, timeframe, strategyId,
        selectedInstrument,
        startDate, endDate, params,
        capital, slippage, commission,
        stopLossPct, takeProfitPct, useTrailingStop,
        pyramiding, positionSizing, positionSizeValue,
        isDynamic, wfoConfig, paramRanges,
        dataStatus, top5Trials, setOosResults, setIsOosValidating,
        fullReportData,
    } = useBacktestContext();

    const strategyName = (id: string) => {
        if (id === '1') return 'RSI Mean Reversion';
        if (id === '3') return 'Moving Average Crossover';
        return 'Custom Strategy';
    };

    const handleRun = async () => {
        if (running) return;
        if (dataStatus !== 'READY') {
            alert('Please load and validate market data first.');
            return;
        }
        if (mode === 'SINGLE' && !selectedInstrument) {
            alert('Please select a symbol from the search results.');
            return;
        }

        setRunning(true);
        logActiveRun({
            type: isDynamic ? 'WALK_FORWARD_OPTIMIZATION' : 'SINGLE_BACKTEST',
            strategyName: strategyName(strategyId),
            symbol: mode === 'SINGLE' ? selectedInstrument?.symbol || symbol : universe,
            timeframe,
            startDate,
            endDate,
            params,
            status: 'running',
        });

        try {
            if (isDynamic && mode === 'SINGLE' && selectedInstrument) {
                // Path 1: Dynamic WFO Backtest
                const result = await fetchClient<any>('/optimization/wfo', {
                    method: 'POST',
                    body: JSON.stringify({
                        symbol: selectedInstrument.symbol,
                        strategyId,
                        ranges: paramRanges,
                        wfoConfig: {
                            ...wfoConfig,
                            startDate,
                            endDate,
                            scoringMetric: 'sharpe',
                            initial_capital: capital,
                        },
                        fullResults: true,
                    }),
                });

                if (result && !result.error) {
                    if (result.wfo) logWFOBreakdown(result.wfo);
                    if (result.grid) logOptunaResults(result.grid);
                    logActiveRun(null);
                    result.timeframe = timeframe;
                    result.symbol = selectedInstrument.symbol;
                    result.strategyName = strategyName(strategyId);
                    navigate('/results', { state: { result } });
                } else {
                    alert('Dynamic Backtest Failed: ' + (result?.error || 'Unknown error'));
                    logActiveRun(null);
                }
            } else if (mode === 'SINGLE' && selectedInstrument) {
                // Path 2: Standard Dhan-based Single Backtest
                const result = await runBacktestWithDhan({
                    instrument_details: {
                        security_id: selectedInstrument.security_id,
                        symbol: selectedInstrument.symbol,
                        exchange_segment: 'NSE_EQ',
                        instrument_type: selectedInstrument.instrument_type,
                    },
                    parameters: {
                        timeframe: TIMEFRAME_MAP[timeframe] || '1d',
                        start_date: startDate,
                        end_date: endDate,
                        initial_capital: capital,
                        statsFreq: statsFreqFromTimeframe(timeframe),
                        strategy_logic: {
                            id: strategyId,
                            name: strategyName(strategyId),
                            stopLossPct,
                            takeProfitPct,
                            useTrailingStop,
                            pyramiding,
                            positionSizing,
                            positionSizeValue,
                            ...params,
                        },
                    },
                });

                if (result) {
                    navigate('/results', { state: { result } });
                }
            } else {
                // Path 3: Fallback for Universe mode
                const config: any = { capital, slippage, commission, ...params };
                if (mode === 'UNIVERSE') config.universe = universe;
                const extendedConfig = {
                    ...config,
                    statsFreq: statsFreqFromTimeframe(timeframe),
                };
                const result = await runBacktest(strategyId, mode === 'SINGLE' ? symbol : universe, extendedConfig);
                if (result) result.timeframe = timeframe;
                navigate('/results', { state: { result } });
            }
        } catch (e) {
            alert('Backtest Failed: ' + e);
            logActiveRun(null);
        } finally {
            setRunning(false);
        }
    };

    const handleOOSValidation = async () => {
        if (!selectedInstrument || top5Trials.length === 0) {
            alert('Please run an optimization first to generate Top 5 parameter sets.');
            return;
        }

        setIsOosValidating(true);
        try {
            const result = await runOOSValidation(
                selectedInstrument.symbol,
                strategyId,
                top5Trials.map((t: any) => t.paramSet),
                startDate,
                endDate,
            );

            if (result && Array.isArray(result.results) && result.results.length > 0) {
                const formattedResults = result.results.map((res: any) => ({
                    ...res,
                    timeframe,
                    symbol: selectedInstrument.symbol,
                    strategyName: strategyName(strategyId),
                }));
                navigate('/results', { state: { result: formattedResults, isOOSArray: true } });
            } else {
                alert('OOS Validation failed to return data array.');
            }
        } catch (e: any) {
            console.error('OOS Validation error', e);
            alert('OOS Validation Failed: ' + (e.message || e));
        } finally {
            setIsOosValidating(false);
        }
    };

    return { handleRun, handleOOSValidation };
};
