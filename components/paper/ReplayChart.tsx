import React, { useMemo } from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    Line,
    ComposedChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

export interface ReplayChartPoint {
    time: string;
    price: number;
    event?: 'entry' | 'exit';
}

interface ReplayChartProps {
    data: ReplayChartPoint[];
    currentBar: number;
    totalBars: number;
    symbol: string;
}

// Cap chart render at 300 points for performance; full data kept in state
const RENDER_CAP = 300;

const formatTime = (ts: string) => {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return ts.slice(0, 10);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch {
        return ts.slice(0, 10);
    }
};

const formatTooltipTime = (ts: string) => {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return ts;
        return d.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return ts;
    }
};

// Custom dot renderer — green for entry, red for exit, invisible otherwise
const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload?.event) return null;
    const isEntry = payload.event === 'entry';
    return (
        <circle
            cx={cx}
            cy={cy}
            r={5}
            fill={isEntry ? '#10b981' : '#ef4444'}
            stroke={isEntry ? '#065f46' : '#7f1d1d'}
            strokeWidth={1.5}
        />
    );
};

// Tooltip formatter
const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as ReplayChartPoint;
    return (
        <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
            <div className="text-slate-400">{formatTooltipTime(d.time)}</div>
            <div className="text-slate-100 font-mono font-bold">₹{d.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            {d.event && (
                <div className={d.event === 'entry' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {d.event === 'entry' ? 'BUY' : 'SELL'}
                </div>
            )}
        </div>
    );
};

export const ReplayChart: React.FC<ReplayChartProps> = ({ data, currentBar, totalBars, symbol }) => {
    // Slice to last RENDER_CAP points for rendering performance
    const renderData = useMemo(() =>
        data.length > RENDER_CAP ? data.slice(data.length - RENDER_CAP) : data,
        [data]
    );

    const currentPrice = data.length > 0 ? data[data.length - 1].price : null;
    const currentTime  = data.length > 0 ? data[data.length - 1].time  : null;

    const isEmpty = data.length < 2;

    // Y-axis domain with 1% padding
    const prices = renderData.map(d => d.price);
    const minP = prices.length ? Math.min(...prices) : 0;
    const maxP = prices.length ? Math.max(...prices) : 1;
    const pad  = (maxP - minP) * 0.01 || 1;
    const yDomain: [number, number] = [minP - pad, maxP + pad];

    return (
        <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-slate-200">
                        {symbol || 'Price'} — Replay
                    </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    {currentPrice !== null && (
                        <span className="font-mono font-bold text-purple-300">
                            ₹{currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    )}
                    {currentTime && (
                        <span className="text-slate-500">{formatTooltipTime(currentTime)}</span>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div className="h-48 px-2 pt-2">
                {isEmpty ? (
                    <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                        Chart will appear when replay starts
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={renderData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                            <defs>
                                <linearGradient id="replayGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="time"
                                tickFormatter={formatTime}
                                tick={{ fill: '#475569', fontSize: 9 }}
                                axisLine={false}
                                tickLine={false}
                                interval="preserveStartEnd"
                                minTickGap={40}
                            />
                            <YAxis
                                domain={yDomain}
                                tickFormatter={(v) => `₹${(v as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                                tick={{ fill: '#475569', fontSize: 9 }}
                                axisLine={false}
                                tickLine={false}
                                width={60}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke="#7c3aed"
                                strokeWidth={1.5}
                                fill="url(#replayGrad)"
                                dot={false}
                                activeDot={false}
                                isAnimationActive={false}
                            />
                            {/* Overlay Line just for custom dots (entry/exit markers) */}
                            <Line
                                type="monotone"
                                dataKey="price"
                                stroke="transparent"
                                dot={<CustomDot />}
                                activeDot={false}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Progress bar */}
            {totalBars > 0 && (
                <div className="px-4 pb-3 pt-2 space-y-1">
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-purple-600 rounded-full transition-all"
                            style={{ width: `${(currentBar / totalBars) * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                        <span className="flex gap-3">
                            <span className="text-emerald-400">● Entry</span>
                            <span className="text-red-400">● Exit</span>
                        </span>
                        <span>Bar {currentBar} / {totalBars}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
