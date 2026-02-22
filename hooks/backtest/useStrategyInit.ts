import { useEffect } from 'react';
import { useBacktestContext } from '../../context/BacktestContext';
import { fetchStrategies } from '../../services/api';
import { Strategy } from '../../types';

/**
 * Handles strategy-related side effects:
 * - Loads custom strategies from backend on mount
 * - Sets default params when strategyId changes
 * - Auto-calculates WFO train/test windows when dates change
 */
export const useStrategyInit = () => {
    const {
        strategyId, setParams, setParamRanges, setShowRanges,
        setCustomStrategies,
        startDate, endDate, isDynamic, setWfoConfig,
    } = useBacktestContext();

    // Load custom strategies from backend on mount
    useEffect(() => {
        const loadStrats = async () => {
            try {
                const strats = await fetchStrategies() as unknown as Strategy[];
                setCustomStrategies(strats);
            } catch (e) {
                console.error('Failed to load strategies', e);
            }
        };
        loadStrats();
    }, []);

    // Set default params when strategy changes
    useEffect(() => {
        if (strategyId === '1') {
            setParams({ period: 14, lower: 30, upper: 70 });
            setParamRanges({
                period: { min: 5, max: 30, step: 1 },
                lower:  { min: 10, max: 40, step: 1 },
                upper:  { min: 60, max: 90, step: 1 },
            });
        } else if (strategyId === '3') {
            setParams({ fast: 10, slow: 50 });
            setParamRanges({
                fast: { min: 5, max: 50, step: 1 },
                slow: { min: 20, max: 200, step: 1 },
            });
        } else {
            setParams({});
            setParamRanges({});
        }
        setShowRanges(false);
    }, [strategyId]);

    // Auto-calculate WFO windows when dates change
    useEffect(() => {
        if (!isDynamic) return;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalMonths = Math.round(
            Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
        );
        let newTrain = 12;
        let newTest = 3;
        if (totalMonths < 12) { newTrain = 3; newTest = 1; }
        else if (totalMonths < 24) { newTrain = 6; newTest = 2; }
        else if (totalMonths < 36) { newTrain = 9; newTest = 3; }
        setWfoConfig({ trainWindow: newTrain, testWindow: newTest });
    }, [startDate, endDate, isDynamic]);
};
