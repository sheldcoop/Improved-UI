import { useNavigate } from 'react-router-dom';
import { useBacktestContext } from '../../context/BacktestContext';
import { runOOSValidation } from '../../services/api';
import { fetchClient } from '../../services/http';
import { logActiveRun, logOptunaResults, logWFOBreakdown } from '../../components/DebugConsole';
import { runBacktestWithDhan } from '../../services/backtestInternal';
import { Timeframe } from '../../types';
import { useToast } from '../../components/ui/Toast';

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
    const { toast } = useToast();
    const {
        running, setRunning,
        symbol, timeframe, strategyId,
        selectedInstrument,
        startDate, endDate, params,
        stopLossPct, takeProfitPct, useTrailingStop, trailingStopPct,
        isDynamic, wfoConfig, paramRanges,
        dataStatus, top5Trials, setOosResults, setIsOosValidating,
        fullReportData,
    } = useBacktestContext();

    const STRATEGY_NAMES: Record<string, string> = {
        '1': 'RSI Mean Reversion',
        '3': 'Moving Average Crossover',
    };
    const strategyName = (id: string) => STRATEGY_NAMES[id] ?? 'Custom Strategy';

    const handleRun = async () => {
        if (running) return;
        if (dataStatus !== 'READY') {
            toast('Please load and validate market data first.', 'warning');
            return;
        }
        if (!selectedInstrument) {
            toast('Please select a symbol from the search results.', 'warning');
            return;
        }

        setRunning(true);
        logActiveRun({
            type: isDynamic ? 'WALK_FORWARD_OPTIMIZATION' : 'SINGLE_BACKTEST',
            strategyName: strategyName(strategyId),
            symbol: selectedInstrument?.symbol || symbol,
            timeframe,
            startDate,
            endDate,
            params,
            status: 'running',
        });

        try {
            if (isDynamic && selectedInstrument) {
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
                    toast('Dynamic Backtest Failed: ' + (result?.error || 'Unknown error'), 'error');
                    logActiveRun(null);
                }
            } else if (selectedInstrument) {
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
                        statsFreq: statsFreqFromTimeframe(timeframe),
                        strategy_logic: {
                            id: strategyId,
                            name: strategyName(strategyId),
                            stopLossPct,
                            takeProfitPct,
                            useTrailingStop,
                            trailingStopPct,
                            ...params,
                        },
                    },
                });

                if (result) {
                    navigate('/results', { state: { result } });
                }
            }
        } catch (e) {
            toast('Backtest Failed: ' + e, 'error');
            logActiveRun(null);
        } finally {
            setRunning(false);
        }
    };

    const handleOOSValidation = async () => {
        if (!selectedInstrument || top5Trials.length === 0) {
            toast('Please run an optimization first to generate Top 5 parameter sets.', 'warning');
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
                toast('OOS Validation failed to return data array.', 'error');
            }
        } catch (e: any) {
            console.error('OOS Validation error', e);
            toast('OOS Validation Failed: ' + (e.message || e), 'error');
        } finally {
            setIsOosValidating(false);
        }
    };

    return { handleRun, handleOOSValidation };
};
