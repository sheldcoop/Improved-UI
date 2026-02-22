import { useBacktestContext } from '../context/BacktestContext';
import { useStrategyInit } from './backtest/useStrategyInit';
import { useInstrumentSearch } from './backtest/useInstrumentSearch';
import { useDataLoader } from './backtest/useDataLoader';
import { useBacktestRunner } from './backtest/useBacktestRunner';

/**
 * Main backtest hook — thin orchestrator.
 * Delegates all logic to focused sub-hooks and exposes
 * a unified { state, setters, handlers } API consumed by Backtest.tsx.
 */
export const useBacktest = () => {
    const context = useBacktestContext();

    // Side-effect hooks (no return value needed)
    useStrategyInit();
    useInstrumentSearch();

    // Handler hooks
    const { handleLoadData } = useDataLoader();
    const { handleRun, handleOOSValidation } = useBacktestRunner();

    return {
        state: {
            running: context.running,
            mode: context.mode,
            segment: context.segment,
            symbol: context.symbol,
            symbolSearchQuery: context.symbolSearchQuery,
            searchResults: context.searchResults,
            selectedInstrument: context.selectedInstrument,
            isSearching: context.isSearching,
            universe: context.universe,
            timeframe: context.timeframe,
            strategyId: context.strategyId,
            customStrategies: context.customStrategies,
            startDate: context.startDate,
            endDate: context.endDate,
            params: context.params,
            capital: context.capital,
            slippage: context.slippage,
            commission: context.commission,
            showAdvanced: context.showAdvanced,
            dataStatus: context.dataStatus,
            healthReport: context.healthReport,
            isDynamic: context.isDynamic,
            wfoConfig: context.wfoConfig,
            paramRanges: context.paramRanges,
            showRanges: context.showRanges,
            top5Trials: context.top5Trials,
            oosResults: context.oosResults,
            isOosValidating: context.isOosValidating,
            stopLossPct: context.stopLossPct,
            stopLossEnabled: context.stopLossEnabled,
            takeProfitPct: context.takeProfitPct,
            takeProfitEnabled: context.takeProfitEnabled,
            useTrailingStop: context.useTrailingStop,
            pyramiding: context.pyramiding,
            positionSizing: context.positionSizing,
            positionSizeValue: context.positionSizeValue,
            fullReportData: context.fullReportData,
            isReportOpen: context.isReportOpen,
            useLookback: context.useLookback,
            lookbackMonths: context.lookbackMonths,
            enableDataSplit: context.enableDataSplit,
            splitRatio: context.splitRatio,
        },
        setters: {
            setRunning: context.setRunning,
            setMode: context.setMode,
            setSegment: context.setSegment,
            setSymbol: context.setSymbol,
            setSymbolSearchQuery: context.setSymbolSearchQuery,
            setSearchResults: context.setSearchResults,
            setSelectedInstrument: context.setSelectedInstrument,
            setIsSearching: context.setIsSearching,
            setUniverse: context.setUniverse,
            setTimeframe: context.setTimeframe,
            setStrategyId: context.setStrategyId,
            setCustomStrategies: context.setCustomStrategies,
            setStartDate: context.setStartDate,
            setEndDate: context.setEndDate,
            setParams: context.setParams,
            setCapital: context.setCapital,
            setSlippage: context.setSlippage,
            setCommission: context.setCommission,
            setShowAdvanced: context.setShowAdvanced,
            setDataStatus: context.setDataStatus,
            setHealthReport: context.setHealthReport,
            setIsDynamic: context.setIsDynamic,
            setWfoConfig: context.setWfoConfig,
            setParamRanges: context.setParamRanges,
            setShowRanges: context.setShowRanges,
            setTop5Trials: context.setTop5Trials,
            setOosResults: context.setOosResults,
            setIsOosValidating: context.setIsOosValidating,
            setStopLossPct: context.setStopLossPct,
            setStopLossEnabled: context.setStopLossEnabled,
            setTakeProfitPct: context.setTakeProfitPct,
            setTakeProfitEnabled: context.setTakeProfitEnabled,
            setUseTrailingStop: context.setUseTrailingStop,
            setPyramiding: context.setPyramiding,
            setPositionSizing: context.setPositionSizing,
            setPositionSizeValue: context.setPositionSizeValue,
            setFullReportData: context.setFullReportData,
            setIsReportOpen: context.setIsReportOpen,
            setUseLookback: context.setUseLookback,
            setLookbackMonths: context.setLookbackMonths,
            setEnableDataSplit: context.setEnableDataSplit,
            setSplitRatio: context.setSplitRatio,
        },
        handlers: {
            handleLoadData,
            handleRun,
            handleOOSValidation,
        },
    };
};
