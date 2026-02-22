import React from 'react';
import { Strategy } from '../../types';

interface StrategyParamInputsProps {
    strategyId: string;
    customStrategies: Strategy[];
    params: Record<string, any>;
    setParams: (params: Record<string, any>) => void;
}

/**
 * Renders dynamic parameter inputs for the selected strategy.
 * For preset strategies (RSI, MACD) params come from context.
 * For custom strategies params come from strategy.params definition.
 * Returns null if the strategy has no configurable parameters.
 */
const StrategyParamInputs: React.FC<StrategyParamInputsProps> = ({
    strategyId, customStrategies, params, setParams,
}) => {
    const customStrategy = customStrategies.find(s => s.id === strategyId);
    const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none';

    // Custom strategy with explicit param definitions
    if (customStrategy?.params && customStrategy.params.length > 0) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {customStrategy.params.map((param: any) => (
                    <div key={param.name}>
                        <label className="text-xs text-slate-500 block mb-1">
                            {param.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </label>
                        <input
                            type="number"
                            step={param.type === 'float' ? '0.1' : '1'}
                            value={params[param.name] ?? param.default}
                            onChange={e =>
                                setParams({
                                    ...params,
                                    [param.name]: param.type === 'float'
                                        ? parseFloat(e.target.value)
                                        : parseInt(e.target.value),
                                })
                            }
                            className={inputCls}
                        />
                    </div>
                ))}
            </div>
        );
    }

    // Preset strategy: RSI (period, lower, upper)
    if (strategyId === '1') {
        return (
            <div className="grid grid-cols-3 gap-3">
                {(['period', 'lower', 'upper'] as const).map(key => (
                    <div key={key}>
                        <label className="text-xs text-slate-500 block mb-1 capitalize">{key}</label>
                        <input
                            type="number"
                            step="1"
                            value={params[key] ?? (key === 'period' ? 14 : key === 'lower' ? 30 : 70)}
                            onChange={e => setParams({ ...params, [key]: parseInt(e.target.value) })}
                            className={inputCls}
                        />
                    </div>
                ))}
            </div>
        );
    }

    // Preset strategy: MACD / MA Crossover (fast, slow)
    if (strategyId === '3') {
        return (
            <div className="grid grid-cols-2 gap-3">
                {(['fast', 'slow'] as const).map(key => (
                    <div key={key}>
                        <label className="text-xs text-slate-500 block mb-1 capitalize">{key}</label>
                        <input
                            type="number"
                            step="1"
                            value={params[key] ?? (key === 'fast' ? 10 : 50)}
                            onChange={e => setParams({ ...params, [key]: parseInt(e.target.value) })}
                            className={inputCls}
                        />
                    </div>
                ))}
            </div>
        );
    }

    return null;
};

export default StrategyParamInputs;
