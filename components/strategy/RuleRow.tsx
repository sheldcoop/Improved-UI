
import React from 'react';
import { Trash2 } from 'lucide-react';
import { Condition, IndicatorType, Operator, Timeframe } from '../../types';

interface RuleRowProps {
    condition: Condition;
    onChange: (c: Condition) => void;
    onRemove: () => void;
}

/** Per-indicator period constraints. null = hide period input (e.g. raw price series). */
const PERIOD_CONFIG: Record<string, { min: number; max: number; label: string } | null> = {
    [IndicatorType.RSI]: { min: 2, max: 100, label: 'Period (2–100)' },
    [IndicatorType.SMA]: { min: 2, max: 500, label: 'Period (2–500)' },
    [IndicatorType.EMA]: { min: 2, max: 500, label: 'Period (2–500)' },
    [IndicatorType.MACD]: { min: 2, max: 50, label: 'Fast period (2–50)' },
    [IndicatorType.MACD_SIGNAL]: { min: 2, max: 50, label: 'Signal period (2–50)' },
    [IndicatorType.BOL_UPPER]: { min: 2, max: 100, label: 'Period (2–100)' },
    [IndicatorType.BOL_LOWER]: { min: 2, max: 100, label: 'Period (2–100)' },
    [IndicatorType.BOL_MID]: { min: 2, max: 100, label: 'Period (2–100)' },
    [IndicatorType.ATR]: { min: 1, max: 50, label: 'Period (1–50)' },
    // Price / Volume — period has no meaning, hide the input
    [IndicatorType.CLOSE]: null,
    [IndicatorType.OPEN]: null,
    [IndicatorType.HIGH]: null,
    [IndicatorType.LOW]: null,
    [IndicatorType.VOLUME]: null,
};

const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, isNaN(val) ? min : val));

export const RuleRow: React.FC<RuleRowProps> = ({ condition, onChange, onRemove }) => {
    const leftCfg = PERIOD_CONFIG[condition.indicator] ?? { min: 2, max: 500, label: 'Period' };
    const rightCfg = condition.rightIndicator
        ? (PERIOD_CONFIG[condition.rightIndicator] ?? { min: 2, max: 500, label: 'Period' })
        : null;

    return (
        <div className="flex items-center space-x-2 bg-slate-950 p-2 rounded border border-slate-800 hover:border-slate-600 transition-colors">
            {/* LEFT SIDE */}
            <div className="flex items-center space-x-1">
                {/* Multi-Timeframe Selector */}
                <select
                    value={condition.timeframe || ''}
                    onChange={(e) => onChange({ ...condition, timeframe: e.target.value ? e.target.value as Timeframe : undefined })}
                    className="bg-slate-900 border border-slate-700 text-purple-300 text-[10px] rounded px-1 py-1 w-14 outline-none mr-1"
                    title="Timeframe Override"
                >
                    <option value="">Curr</option>
                    {Object.values(Timeframe).map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <select
                    value={condition.indicator}
                    onChange={(e) => onChange({ ...condition, indicator: e.target.value as IndicatorType, period: 14 })}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-28 outline-none"
                >
                    {Object.values(IndicatorType).map(i => <option key={i} value={i}>{i}</option>)}
                </select>

                {/* Period input — hidden for raw price/volume indicators */}
                {leftCfg !== null && (
                    <input
                        type="number"
                        value={condition.period ?? 14}
                        min={leftCfg.min}
                        max={leftCfg.max}
                        title={leftCfg.label}
                        onChange={(e) => onChange({ ...condition, period: parseInt(e.target.value) })}
                        onBlur={(e) => onChange({ ...condition, period: clamp(parseInt(e.target.value), leftCfg.min, leftCfg.max) })}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-1 py-1 w-12 text-center"
                        placeholder="14"
                    />
                )}
            </div>

            {/* OPERATOR */}
            <select
                value={condition.operator}
                onChange={(e) => onChange({ ...condition, operator: e.target.value as Operator })}
                className="bg-slate-900 border border-slate-700 text-emerald-400 font-bold text-xs rounded px-2 py-1 outline-none"
            >
                {Object.values(Operator).map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            {/* RIGHT SIDE */}
            <div className="flex items-center space-x-1 flex-1">
                <button
                    onClick={() => onChange({ ...condition, compareType: condition.compareType === 'STATIC' ? 'INDICATOR' : 'STATIC' })}
                    className={`text-[10px] px-1 py-1 rounded border ${condition.compareType === 'STATIC' ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-purple-900/30 border-purple-500 text-purple-400'}`}
                >
                    {condition.compareType === 'STATIC' ? '123' : 'IND'}
                </button>

                {condition.compareType === 'STATIC' ? (
                    <input
                        type="number"
                        value={condition.value}
                        onChange={(e) => onChange({ ...condition, value: parseFloat(e.target.value) })}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-24"
                    />
                ) : (
                    <>
                        {/* MTF for Right Side */}
                        <select
                            value={condition.rightTimeframe || ''}
                            onChange={(e) => onChange({ ...condition, rightTimeframe: e.target.value ? e.target.value as Timeframe : undefined })}
                            className="bg-slate-900 border border-slate-700 text-purple-300 text-[10px] rounded px-1 py-1 w-14 outline-none mr-1"
                        >
                            <option value="">Curr</option>
                            {Object.values(Timeframe).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <select
                            value={condition.rightIndicator}
                            onChange={(e) => onChange({ ...condition, rightIndicator: e.target.value as IndicatorType, rightPeriod: 14 })}
                            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-28 outline-none"
                        >
                            {Object.values(IndicatorType).map(i => <option key={i} value={i}>{i}</option>)}
                        </select>

                        {rightCfg !== null && (
                            <input
                                type="number"
                                value={condition.rightPeriod ?? 14}
                                min={rightCfg.min}
                                max={rightCfg.max}
                                title={rightCfg.label}
                                onChange={(e) => onChange({ ...condition, rightPeriod: parseInt(e.target.value) })}
                                onBlur={(e) => onChange({ ...condition, rightPeriod: clamp(parseInt(e.target.value), rightCfg.min, rightCfg.max) })}
                                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-1 py-1 w-12 text-center"
                            />
                        )}
                    </>
                )}
            </div>

            <button onClick={onRemove} className="text-slate-600 hover:text-red-400 p-1">
                <Trash2 className="w-3 h-3" />
            </button>
        </div>
    );
};
