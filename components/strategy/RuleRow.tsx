
import React from 'react';
import { Trash2 } from 'lucide-react';
import { Condition, IndicatorType, Operator, Timeframe } from '../../types';

interface RuleRowProps {
    condition: Condition;
    onChange: (c: Condition) => void;
    onRemove: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// INDICATOR_GROUPS — single source of truth for the dropdown and period config.
// Order mirrors indicator_registry.py on the backend. To add a new indicator:
//   1. Add it to indicator_registry.py (backend)
//   2. Add enum value to IndicatorType in types.ts
//   3. Add it to the matching group below
// ─────────────────────────────────────────────────────────────────────────────

type PeriodCfg = { min: number; max: number; label: string } | null;

interface IndicatorSpec {
    value: IndicatorType;
    label: string;
    period: PeriodCfg;
}

interface IndicatorGroup {
    group: string;
    indicators: IndicatorSpec[];
}

const p = (min: number, max: number, label: string): PeriodCfg => ({ min, max, label });

const INDICATOR_GROUPS: IndicatorGroup[] = [
    {
        group: 'Price',
        indicators: [
            { value: IndicatorType.CLOSE, label: 'Close Price', period: null },
            { value: IndicatorType.OPEN, label: 'Open Price', period: null },
            { value: IndicatorType.HIGH, label: 'High Price', period: null },
            { value: IndicatorType.LOW, label: 'Low Price', period: null },
            { value: IndicatorType.VOLUME, label: 'Volume', period: null },
        ],
    },
    {
        group: 'Trend',
        indicators: [
            { value: IndicatorType.SMA, label: 'SMA', period: p(2, 500, 'Period (2–500)') },
            { value: IndicatorType.EMA, label: 'EMA', period: p(2, 500, 'Period (2–500)') },
            { value: IndicatorType.MACD, label: 'MACD', period: p(2, 50, 'Fast period (2–50)') },
            { value: IndicatorType.MACD_SIGNAL, label: 'MACD Signal', period: p(2, 50, 'Signal period (2–50)') },
            { value: IndicatorType.ADX, label: 'ADX', period: p(2, 50, 'Period (2–50)') },
            { value: IndicatorType.PSAR_UP, label: 'Parabolic SAR Up', period: null },
            { value: IndicatorType.PSAR_DOWN, label: 'Parabolic SAR Down', period: null },
            { value: IndicatorType.ICHIMOKU_TENKAN, label: 'Ichimoku Tenkan', period: p(5, 50, 'Conversion (5–50)') },
            { value: IndicatorType.ICHIMOKU_KIJUN, label: 'Ichimoku Kijun', period: p(10, 100, 'Base (10–100)') },
        ],
    },
    {
        group: 'Momentum',
        indicators: [
            { value: IndicatorType.RSI, label: 'RSI', period: p(2, 100, 'Period (2–100)') },
            { value: IndicatorType.STOCH_K, label: 'Stochastic K', period: p(5, 50, 'Period (5–50)') },
            { value: IndicatorType.STOCH_D, label: 'Stochastic D', period: p(5, 50, 'Period (5–50)') },
            { value: IndicatorType.WILLIAMS_R, label: 'Williams %R', period: p(5, 50, 'Period (5–50)') },
            { value: IndicatorType.CCI, label: 'CCI', period: p(5, 100, 'Period (5–100)') },
            { value: IndicatorType.ROC, label: 'ROC', period: p(2, 50, 'Period (2–50)') },
            { value: IndicatorType.MFI, label: 'MFI', period: p(5, 50, 'Period (5–50)') },
        ],
    },
    {
        group: 'Volatility',
        indicators: [
            { value: IndicatorType.ATR, label: 'ATR', period: p(1, 50, 'Period (1–50)') },
            { value: IndicatorType.BOL_UPPER, label: 'Bollinger Upper', period: p(2, 100, 'Period (2–100)') },
            { value: IndicatorType.BOL_LOWER, label: 'Bollinger Lower', period: p(2, 100, 'Period (2–100)') },
            { value: IndicatorType.BOL_MID, label: 'Bollinger Mid', period: p(2, 100, 'Period (2–100)') },
            { value: IndicatorType.KELTNER_UPPER, label: 'Keltner Upper', period: p(5, 50, 'Period (5–50)') },
            { value: IndicatorType.KELTNER_LOWER, label: 'Keltner Lower', period: p(5, 50, 'Period (5–50)') },
            { value: IndicatorType.DONCHIAN_HIGH, label: 'Donchian High', period: p(5, 100, 'Period (5–100)') },
            { value: IndicatorType.DONCHIAN_LOW, label: 'Donchian Low', period: p(5, 100, 'Period (5–100)') },
        ],
    },
    {
        group: 'Volume',
        indicators: [
            { value: IndicatorType.VWAP, label: 'VWAP', period: null },
            { value: IndicatorType.OBV, label: 'OBV', period: null },
            { value: IndicatorType.CMF, label: 'CMF', period: p(5, 50, 'Period (5–50)') },
        ],
    },
];

/** Flat lookup: indicator value → period config. */
const PERIOD_CONFIG: Record<string, PeriodCfg> = Object.fromEntries(
    INDICATOR_GROUPS.flatMap(g => g.indicators.map(ind => [ind.value, ind.period]))
);

const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, isNaN(val) ? min : val));

/** Grouped indicator <select> — renders <optgroup> sections per indicator category. */
const IndicatorSelect: React.FC<{
    value: IndicatorType;
    onChange: (v: IndicatorType) => void;
    className?: string;
}> = ({ value, onChange, className }) => (
    <select
        value={value}
        onChange={e => onChange(e.target.value as IndicatorType)}
        className={className}
    >
        {INDICATOR_GROUPS.map(({ group, indicators }) => (
            <optgroup key={group} label={`── ${group} ──`}>
                {indicators.map(ind => (
                    <option key={ind.value} value={ind.value}>{ind.label}</option>
                ))}
            </optgroup>
        ))}
    </select>
);

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

                <IndicatorSelect
                    value={condition.indicator}
                    onChange={(newInd) => {
                        const cfg = PERIOD_CONFIG[newInd];
                        const keepPeriod = cfg !== null && condition.period >= cfg.min && condition.period <= cfg.max;
                        onChange({ ...condition, indicator: newInd, period: keepPeriod ? condition.period : 14 });
                    }}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-36 outline-none"
                />

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

                        <IndicatorSelect
                            value={condition.rightIndicator ?? IndicatorType.CLOSE}
                            onChange={(newInd) => {
                                const cfg = PERIOD_CONFIG[newInd];
                                const keepPeriod = cfg !== null && (condition.rightPeriod ?? 14) >= cfg.min && (condition.rightPeriod ?? 14) <= cfg.max;
                                onChange({ ...condition, rightIndicator: newInd, rightPeriod: keepPeriod ? (condition.rightPeriod ?? 14) : 14 });
                            }}
                            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-36 outline-none"
                        />

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
