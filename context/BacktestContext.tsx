/**
 * BacktestContext — composite context that merges DataContext, StrategyContext,
 * and ExecutionContext into the single `useBacktestContext()` API consumed by
 * all existing hooks and pages.
 *
 * Architecture:
 *   DataProvider      → market-data / instrument / date state
 *   StrategyProvider  → strategy selection, params, risk controls, WFO config
 *   ExecutionProvider → capital, costs, running flag, OOS / stats state
 *
 * useBacktestContext() re-exports everything from all three sub-contexts so
 * existing call-sites need zero changes.  Components that only need a subset
 * can opt in to the granular hooks (useDataContext, useStrategyContext,
 * useExecutionContext) for tighter re-render boundaries.
 */
import React, { createContext, useContext, ReactNode } from 'react';

import { DataProvider, useDataContext, DataContextType } from './DataContext';
import { StrategyProvider, useStrategyContext, StrategyContextType } from './StrategyContext';
import { ExecutionProvider, useExecutionContext, ExecutionContextType } from './ExecutionContext';

// Re-export sub-context hooks for granular consumption
export { useDataContext } from './DataContext';
export { useStrategyContext } from './StrategyContext';
export { useExecutionContext } from './ExecutionContext';

// Combined type — union of all three sub-contexts
export type BacktestContextType = DataContextType & StrategyContextType & ExecutionContextType;

// Internal context holds the merged value
const BacktestContext = createContext<BacktestContextType | undefined>(undefined);

/**
 * Inner provider: reads from all three sub-contexts and merges into one value.
 * Must be rendered inside DataProvider + StrategyProvider + ExecutionProvider.
 */
const BacktestMerger: React.FC<{ children: ReactNode }> = ({ children }) => {
    const data = useDataContext();
    const strategy = useStrategyContext();
    const execution = useExecutionContext();

    const value: BacktestContextType = { ...data, ...strategy, ...execution };

    return <BacktestContext.Provider value={value}>{children}</BacktestContext.Provider>;
};

/**
 * BacktestProvider — wraps the entire app section that needs backtest state.
 * Composes DataProvider → StrategyProvider → ExecutionProvider → merger.
 */
export const BacktestProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
    <DataProvider>
        <StrategyProvider>
            <ExecutionProvider>
                <BacktestMerger>
                    {children}
                </BacktestMerger>
            </ExecutionProvider>
        </StrategyProvider>
    </DataProvider>
);

/**
 * Combined hook — returns the full merged context.
 * Existing call-sites continue to work unchanged.
 */
export const useBacktestContext = (): BacktestContextType => {
    const ctx = useContext(BacktestContext);
    if (!ctx) throw new Error('useBacktestContext must be used within a BacktestProvider');
    return ctx;
};
