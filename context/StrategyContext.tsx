/**
 * StrategyContext — owns strategy selection, parameters, risk controls, and
 * WFO / optimization-related state.
 *
 * Isolated from DataContext so that switching strategy or adjusting SL/TP
 * does not force re-renders in the market-data components.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Strategy } from '../types';

export interface StrategyContextType {
    // Strategy selection
    strategyId: string;
    setStrategyId: (val: string) => void;
    customStrategies: Strategy[];
    setCustomStrategies: (val: Strategy[]) => void;
    params: Record<string, number>;
    setParams: (val: Record<string, number>) => void;

    // Risk controls
    stopLossPct: number;
    setStopLossPct: (val: number) => void;
    stopLossEnabled: boolean;
    setStopLossEnabled: (val: boolean) => void;
    takeProfitPct: number;
    setTakeProfitPct: (val: number) => void;
    takeProfitEnabled: boolean;
    setTakeProfitEnabled: (val: boolean) => void;
    useTrailingStop: boolean;
    setUseTrailingStop: (val: boolean) => void;
    trailingStopPct: number;
    setTrailingStopPct: (val: number) => void;

    //  WFO / optimization
    isDynamic: boolean;
    setIsDynamic: (val: boolean) => void;
    wfoConfig: { trainWindow: number; testWindow: number };
    setWfoConfig: (val: { trainWindow: number; testWindow: number }) => void;
    paramRanges: Record<string, { min: number; max: number; step: number }>;
    setParamRanges: (val: Record<string, { min: number; max: number; step: number }>) => void;
    showRanges: boolean;
    setShowRanges: (val: boolean) => void;

    // Data split (shared between Backtest and Optimization pages)
    enableDataSplit: boolean;
    setEnableDataSplit: (val: boolean) => void;
    splitRatio: number;
    setSplitRatio: (val: number) => void;
}

export const StrategyContext = createContext<StrategyContextType | undefined>(undefined);

const load = (key: string, def: any) => {
    const stored = localStorage.getItem(`backtest_${key}`);
    if (!stored) return def;
    try { return JSON.parse(stored); } catch { return stored; }
};

export const StrategyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [strategyId, setStrategyId] = useState<string>(() => load('strategyId', '1'));
    const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);
    const [params, setParams] = useState<Record<string, number>>({});
    const [stopLossPct, setStopLossPct] = useState(0);
    const [stopLossEnabled, setStopLossEnabled] = useState(false);
    const [takeProfitPct, setTakeProfitPct] = useState(0);
    const [takeProfitEnabled, setTakeProfitEnabled] = useState(false);
    const [useTrailingStop, setUseTrailingStop] = useState(false);
    const [trailingStopPct, setTrailingStopPct] = useState(0);
    const [isDynamic, setIsDynamic] = useState(false);
    const [wfoConfig, setWfoConfig] = useState({ trainWindow: 12, testWindow: 3 });
    const [paramRanges, setParamRanges] = useState<Record<string, { min: number; max: number; step: number }>>({});
    const [showRanges, setShowRanges] = useState(false);
    const [enableDataSplit, setEnableDataSplit] = useState(false);
    const [splitRatio, setSplitRatio] = useState(70);

    // Persist strategyId so the user's last strategy survives page refresh
    useEffect(() => { localStorage.setItem('backtest_strategyId', JSON.stringify(strategyId)); }, [strategyId]);

    const value: StrategyContextType = {
        strategyId, setStrategyId, customStrategies, setCustomStrategies,
        params, setParams,
        stopLossPct, setStopLossPct, stopLossEnabled, setStopLossEnabled,
        takeProfitPct, setTakeProfitPct, takeProfitEnabled, setTakeProfitEnabled,
        useTrailingStop, setUseTrailingStop, trailingStopPct, setTrailingStopPct,
        isDynamic, setIsDynamic, wfoConfig, setWfoConfig,
        paramRanges, setParamRanges, showRanges, setShowRanges,
        enableDataSplit, setEnableDataSplit, splitRatio, setSplitRatio,
    };

    return <StrategyContext.Provider value={value}>{children}</StrategyContext.Provider>;
};

export const useStrategyContext = (): StrategyContextType => {
    const ctx = useContext(StrategyContext);
    if (!ctx) throw new Error('useStrategyContext must be used within a StrategyProvider');
    return ctx;
};
