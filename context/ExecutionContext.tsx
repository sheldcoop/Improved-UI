/**
 * ExecutionContext — owns simulation execution state:
 * capital, costs, running flag, OOS / optimization results, and stats settings.
 *
 * Isolated so that slippage/commission changes (frequent during setup) don't
 * cascade re-renders into strategy or data components.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { OptimizationResponse, WFOResult } from '../types';

export interface ExecutionContextType {
    // Simulation controls
    running: boolean;
    setRunning: (val: boolean) => void;
    showAdvanced: boolean;
    setShowAdvanced: (val: boolean) => void;

    // Optimization / OOS
    optResults: (OptimizationResponse & { wfo: WFOResult[]; period?: string }) | null;
    setOptResults: (val: (OptimizationResponse & { wfo: WFOResult[]; period?: string }) | null) => void;
    top5Trials: any[];
    setTop5Trials: (val: any[]) => void;
    oosResults: any[];
    setOosResults: (val: any[]) => void;
    isOosValidating: boolean;
    setIsOosValidating: (val: boolean) => void;

    // Stats configuration
    statsFreq: string | null;
    setStatsFreq: (val: string | null) => void;
    statsWindow: number | null;
    setStatsWindow: (val: number | null) => void;
}

export const ExecutionContext = createContext<ExecutionContextType | undefined>(undefined);

const load = (key: string, def: any) => {
    const stored = localStorage.getItem(`backtest_${key}`);
    if (!stored) return def;
    try { return JSON.parse(stored); } catch { return stored; }
};

export const ExecutionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [running, setRunning] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [optResults, setOptResults] = useState<(OptimizationResponse & { wfo: WFOResult[]; period?: string }) | null>(null);
    const [top5Trials, setTop5Trials] = useState<any[]>([]);
    const [oosResults, setOosResults] = useState<any[]>([]);
    const [isOosValidating, setIsOosValidating] = useState(false);
    const [statsFreq, setStatsFreq] = useState<string | null>(() => load('statsFreq', null));
    const [statsWindow, setStatsWindow] = useState<number | null>(() => load('statsWindow', null));

    // Persistence for frequently-restored fields
    useEffect(() => { localStorage.setItem('backtest_statsFreq', JSON.stringify(statsFreq)); }, [statsFreq]);
    useEffect(() => { localStorage.setItem('backtest_statsWindow', JSON.stringify(statsWindow)); }, [statsWindow]);

    const value: ExecutionContextType = {
        running, setRunning,
        showAdvanced, setShowAdvanced,
        optResults, setOptResults,
        top5Trials, setTop5Trials, oosResults, setOosResults,
        isOosValidating, setIsOosValidating,
        statsFreq, setStatsFreq, statsWindow, setStatsWindow,
    };

    return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
};

export const useExecutionContext = (): ExecutionContextType => {
    const ctx = useContext(ExecutionContext);
    if (!ctx) throw new Error('useExecutionContext must be used within an ExecutionProvider');
    return ctx;
};
