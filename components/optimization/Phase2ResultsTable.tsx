import React from 'react';
import { CheckCircle2, Calendar, Info } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface RiskResultRow {
    paramSet: Record<string, number>;
    score: number;
    winRate?: number;
    drawdown?: number;
    trades?: number;
}

interface Phase2ResultsTableProps {
    riskGrid: RiskResultRow[];
    optunaMetric: string;
    splitRatio?: number;
    combinedParams?: Record<string, number>;
    selectedRiskParams: Record<string, number> | null;
    setSelectedRiskParams: (params: Record<string, number> | null) => void;
    onApply: (combined: Record<string, number>) => void;
    // Date range metadata from backend
    phase2StartDate?: string;
    phase2Bars?: number;
    dataEndDate?: string;
    dataStartDate?: string;
    totalBars?: number;
}

// Risk param keys — everything else in combinedParams is a Phase 1 strategy param
const RISK_PARAM_KEYS = new Set(['stopLossPct', 'takeProfitPct', 'trailingStopPct']);

/**
 * Phase 2 risk parameter results table with data-range banner.
 */
const Phase2ResultsTable: React.FC<Phase2ResultsTableProps> = ({
    riskGrid, optunaMetric, splitRatio, combinedParams,
    selectedRiskParams, setSelectedRiskParams,
    onApply,
    phase2StartDate, phase2Bars, dataEndDate, dataStartDate, totalBars,
}) => {
    const splitActive = splitRatio != null && splitRatio > 0 && phase2StartDate;

    // Extract Phase 1 strategy params from combinedParams (exclude risk keys)
    const lockedStrategyParams = combinedParams
        ? Object.entries(combinedParams).filter(([k]) => !RISK_PARAM_KEYS.has(k))
        : [];

    return (
        <div className="space-y-4 mt-6">
            <div className="flex items-center gap-3">
                <div className="w-2 h-8 rounded-full bg-emerald-500" />
                <div>
                    <h4 className="text-lg font-semibold text-emerald-300">Phase 2 — Risk Params</h4>
                    <p className="text-xs text-slate-400">Choose a risk configuration below, then click "Apply to Backtest" to load params</p>
                </div>
            </div>

            {/* Locked Phase 1 params banner */}
            {lockedStrategyParams.length > 0 && (
                <div className="flex items-center gap-2 bg-indigo-900/20 border border-indigo-700/40 rounded-lg px-4 py-2.5">
                    <span className="text-xs text-indigo-300 font-semibold shrink-0">Phase 1 params locked:</span>
                    <div className="flex gap-2 flex-wrap">
                        {lockedStrategyParams.map(([k, v]) => (
                            <span key={k} className="bg-slate-950 border border-indigo-700/60 px-2 py-0.5 rounded font-mono text-xs text-indigo-200">
                                {k}: <span className="text-indigo-400">{v}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Data range banner */}
            {splitActive ? (
                <div className="flex items-start gap-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-4 py-2.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-emerald-300">
                        <span className="font-semibold">Phase 2 trained on:</span>{' '}
                        {phase2StartDate} → {dataEndDate}{' '}
                        <span className="text-emerald-400/70">
                            ({phase2Bars?.toLocaleString()} bars, {Math.round((1 - (splitRatio ?? 0)) * 100)}% of total — no overlap with Phase 1)
                        </span>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-2.5">
                    <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-300">
                        <span className="font-semibold">Phase 2 trained on full dataset:</span>{' '}
                        {dataStartDate} → {dataEndDate}{' '}
                        <span className="text-amber-400/70">({totalBars?.toLocaleString()} bars, same data as Phase 1)</span>
                    </div>
                </div>
            )}

            <Card className="p-0 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-200">
                        <tr>
                            <th className="p-4 rounded-tl-lg">Rank</th>
                            <th className="p-4">Risk Set</th>
                            <th className="p-4">Score ({optunaMetric})</th>
                            <th className="p-4">Win Rate</th>
                            <th className="p-4">Drawdown</th>
                            <th className="p-4">Trades</th>
                            <th className="p-4 text-right rounded-tr-lg">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {riskGrid.slice(0, 10).map((res, idx) => {
                            const isSelected = selectedRiskParams !== null &&
                                JSON.stringify(selectedRiskParams) === JSON.stringify(res.paramSet);
                            return (
                            <tr key={idx} className={`hover:bg-slate-800/50 group transition-colors ${isSelected ? 'bg-emerald-900/20 border-l-2 border-emerald-500' : ''}`}>
                                <td className="p-4 font-bold text-emerald-500">#{idx + 1}</td>
                                <td className="p-4 font-mono text-xs text-slate-300">
                                    <div className="flex gap-2 flex-wrap">
                                        {Object.entries(res.paramSet).map(([k, v]) => (
                                            <span key={k} className="bg-slate-950 border border-slate-700 px-2 py-0.5 rounded">
                                                {k}: <span className="text-indigo-400">{v as React.ReactNode}</span>
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-slate-100 font-medium">{res.score.toFixed(4)}</td>
                                <td className="p-4">{res.winRate?.toFixed(1)}%</td>
                                <td className="p-4"><span className="text-red-400">-{res.drawdown?.toFixed(2)}%</span></td>
                                <td className="p-4">{res.trades}</td>
                                <td className="p-4 text-right">
                                    <Button
                                        size="sm"
                                        variant={isSelected ? 'secondary' : 'ghost'}
                                        onClick={() => setSelectedRiskParams(res.paramSet)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        icon={<CheckCircle2 className="w-4 h-4" />}
                                    >
                                        {isSelected ? 'Selected' : 'Choose'}
                                    </Button>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default Phase2ResultsTable;
