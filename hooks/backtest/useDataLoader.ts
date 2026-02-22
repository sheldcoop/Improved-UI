import { useEffect } from 'react';
import { useBacktestContext } from '../../context/BacktestContext';
import { fetchAndValidateMarketData } from '../../services/api';
import { logActiveRun, logDataHealth, logAlert } from '../../components/DebugConsole';

/**
 * Handles market data loading:
 * - Resets dataStatus when symbol/timeframe/dates change
 * - Provides handleLoadData which fetches + validates market data
 * - Applies lookback offset if useLookback is enabled
 */
export const useDataLoader = () => {
    const {
        mode, symbol, universe, timeframe, startDate, endDate,
        useLookback, lookbackMonths,
        setDataStatus, setHealthReport, setFullReportData, setIsReportOpen,
        isFetchingData, setIsFetchingData,
    } = useBacktestContext();

    // Reset data status when key inputs change
    useEffect(() => {
        setDataStatus('IDLE');
        setHealthReport(null);
    }, [symbol, universe, timeframe, startDate, endDate]);

    const handleLoadData = async () => {
        if (isFetchingData) {
            console.log('handleLoadData called while already fetching; ignoring');
            return;
        }

        setIsFetchingData(true);
        setDataStatus('LOADING');

        try {
            const target = mode === 'SINGLE' ? symbol : universe;

            // Extend from-date to cover indicator warmup lookback
            const fromDateObj = new Date(startDate);
            fromDateObj.setMonth(fromDateObj.getMonth() - (useLookback ? lookbackMonths : 0));
            const extendedFromDate = fromDateObj.toISOString().split('T')[0];

            console.log(`Data fetch range: ${extendedFromDate} → ${endDate} (lookback: ${useLookback ? lookbackMonths : 0}m)`);

            logActiveRun({
                type: 'DATA_LOADING',
                strategyName: 'Market Data Validator',
                symbol: target,
                timeframe,
                startDate: extendedFromDate,
                endDate,
                status: 'running',
            });

            const fullReport = await fetchAndValidateMarketData(target, timeframe, extendedFromDate, endDate);
            setHealthReport(fullReport.health);
            setFullReportData(fullReport);
            setIsReportOpen(true);
            logDataHealth(fullReport.health);

            if (fullReport.health.status === 'POOR' || fullReport.health.status === 'CRITICAL') {
                logAlert([{
                    type: 'warning',
                    msg: `Data health is ${fullReport.health.status} for ${target}. ${fullReport.health.missingCandles} candles missing.`,
                    timestamp: new Date().toLocaleTimeString(),
                }]);
            }

            setDataStatus('READY');
        } catch (e) {
            console.error('Data load failed', e);
            setDataStatus('ERROR');
            logAlert([{
                type: 'error',
                msg: `Failed to load data for ${mode === 'SINGLE' ? symbol : universe}: ${e}`,
                timestamp: new Date().toLocaleTimeString(),
            }]);
        } finally {
            logActiveRun(null);
            setIsFetchingData(false);
        }
    };

    return { handleLoadData };
};
