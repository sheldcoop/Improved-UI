/**
 * SeasonalityPanel.tsx — Tab 2: Seasonality & Patterns.
 *
 * Monthly return heatmap, day-of-week returns, 52-week proximity,
 * win/loss streaks, and best/worst months.
 */

import React from 'react';
import { Calendar, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import type { SeasonalityData } from '../../services/researchService';

interface SeasonalityPanelProps {
    data: SeasonalityData;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SeasonalityPanel: React.FC<SeasonalityPanelProps> = ({ data }) => {
    // Group heatmap by year
    const years = [...new Set(data.monthlyHeatmap.map(r => r.year))].sort();

    return (
        <div className="space-y-8">

            {/* Monthly Average Returns */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-2" /> Average Monthly Return (All Years)
                </h4>
                <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                    {data.monthlyAverage.map(m => {
                        const v = m.avgReturnPct;
                        let bg = 'bg-slate-800 text-slate-400';
                        if (v > 3) bg = 'bg-emerald-500 text-white font-bold';
                        else if (v > 1) bg = 'bg-emerald-600/70 text-emerald-100';
                        else if (v > 0) bg = 'bg-emerald-900/50 text-emerald-300';
                        else if (v < -3) bg = 'bg-red-500 text-white font-bold';
                        else if (v < -1) bg = 'bg-red-600/70 text-red-100';
                        else if (v < 0) bg = 'bg-red-900/50 text-red-300';
                        return (
                            <div key={m.month} className={`rounded-lg p-3 text-center ${bg} transition-all hover:scale-105`}>
                                <div className="text-[10px] uppercase opacity-80">{MONTH_NAMES[m.month - 1]}</div>
                                <div className="text-sm font-mono font-bold mt-1">
                                    {v > 0 ? '+' : ''}{v.toFixed(1)}%
                                </div>
                                <div className="text-[9px] opacity-60 mt-0.5">{m.count}yr</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Monthly Heatmap by Year */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Monthly Breakdown (Year × Month)
                </h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-500">
                                <th className="px-2 py-1.5 text-left font-medium">Year</th>
                                {MONTH_NAMES.map(m => (
                                    <th key={m} className="px-2 py-1.5 text-center font-medium">{m}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {years.map(year => (
                                <tr key={year} className="border-t border-slate-800/50">
                                    <td className="px-2 py-1 text-slate-400 font-bold">{year}</td>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                                        const entry = data.monthlyHeatmap.find(r => r.year === year && r.month === month);
                                        if (!entry) return <td key={month} className="px-2 py-1 text-center text-slate-700">—</td>;
                                        const v = entry.returnPct;
                                        let cls = 'text-slate-400';
                                        if (v > 5) cls = 'text-emerald-400 font-bold';
                                        else if (v > 0) cls = 'text-emerald-500';
                                        else if (v < -5) cls = 'text-red-400 font-bold';
                                        else if (v < 0) cls = 'text-red-500';
                                        return (
                                            <td key={month} className={`px-2 py-1 text-center font-mono ${cls}`}>
                                                {v > 0 ? '+' : ''}{v.toFixed(1)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Day of Week */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Day-of-Week Effect
                </h4>
                <div className="flex gap-3">
                    {data.dayOfWeek.map(d => {
                        const v = d.avgReturnPct;
                        const barHeight = Math.min(60, Math.abs(v) * 300);
                        return (
                            <div key={d.day} className="flex-1 flex flex-col items-center">
                                <div className="text-[10px] text-slate-500 mb-1">{d.day}</div>
                                <div className="relative w-full h-16 flex items-end justify-center">
                                    <div
                                        className={`w-8 rounded-t transition-all ${v >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                                        style={{ height: `${barHeight}px` }}
                                    />
                                </div>
                                <div className={`text-xs font-mono font-bold mt-1 ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {v >= 0 ? '+' : ''}{v.toFixed(4)}%
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-slate-600 mt-2 italic">
                    Average daily return by day of week. Statistically significant edges are rare but exploitable.
                </p>
            </div>

            {/* 52-Week Proximity & Streaks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                        <TrendingUp className="w-3 h-3 mr-1.5" /> 52-Week Position
                    </h4>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-400">From 52W High</span>
                            <span className={`font-mono font-bold text-sm ${data.pctFrom52WeekHigh >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {data.pctFrom52WeekHigh >= 0 ? '+' : ''}{data.pctFrom52WeekHigh}%
                            </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2">
                            <div
                                className="bg-gradient-to-r from-red-500 to-emerald-500 h-2 rounded-full transition-all"
                                style={{ width: `${Math.max(5, 100 + data.pctFrom52WeekHigh)}%` }}
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-400">From 52W Low</span>
                            <span className={`font-mono font-bold text-sm ${data.pctFrom52WeekLow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                +{data.pctFrom52WeekLow}%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                        <Zap className="w-3 h-3 mr-1.5" /> Win/Loss Streaks
                    </h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Max Win Streak</span>
                            <span className="text-emerald-400 font-bold">{data.streaks.maxWinStreak} days</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Max Loss Streak</span>
                            <span className="text-red-400 font-bold">{data.streaks.maxLossStreak} days</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
                            <span className="text-slate-400">Current Streak</span>
                            <span className={`font-bold ${data.streaks.currentStreakType === 'win' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {data.streaks.currentStreak} ({data.streaks.currentStreakType})
                            </span>
                        </div>
                    </div>

                    {/* Best / Worst */}
                    {data.bestMonth && (
                        <div className="mt-4 pt-3 border-t border-slate-800 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 flex items-center"><TrendingUp className="w-3 h-3 mr-1 text-emerald-500" /> Best Month</span>
                                <span className="text-emerald-400 font-mono">{MONTH_NAMES[(data.bestMonth.month) - 1]} {data.bestMonth.year}: +{data.bestMonth.returnPct}%</span>
                            </div>
                            {data.worstMonth && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500 flex items-center"><TrendingDown className="w-3 h-3 mr-1 text-red-500" /> Worst Month</span>
                                    <span className="text-red-400 font-mono">{MONTH_NAMES[(data.worstMonth.month) - 1]} {data.worstMonth.year}: {data.worstMonth.returnPct}%</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeasonalityPanel;
