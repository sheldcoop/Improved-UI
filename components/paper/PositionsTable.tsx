import React from 'react';
import { XCircle, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card';

export interface PaperPosition {
    id: string;
    monitor_id: string | null;
    symbol: string;
    side: 'LONG' | 'SHORT';
    qty: number;
    avg_price: number;
    ltp: number;
    pnl: number;
    pnl_pct: number;
    sl_price: number | null;
    tp_price: number | null;
    entry_time: string;
    indicators?: Record<string, number>;
}

interface PositionsTableProps {
    positions: PaperPosition[];
    onClosePosition: (id: string) => Promise<void>;
    closingId: string | null;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
    positions,
    onClosePosition,
    closingId
}) => {
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

    return (
        <Card title="Open Positions" className="p-0 overflow-hidden" action={
            positions.length > 0 && (
                <div className={`text-xs font-bold px-3 py-1 rounded border ${totalPnl >= 0 ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' : 'bg-red-900/30 text-red-400 border-red-800/50'}`}>
                    Total: {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
                </div>
            )
        }>
            {positions.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                    <p className="text-sm">No open positions.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                            <tr>
                                <th className="px-4 py-3 font-medium">Symbol</th>
                                <th className="px-4 py-3 font-medium">Side/Qty</th>
                                <th className="px-4 py-3 font-medium">Entry</th>
                                <th className="px-4 py-3 font-medium">LTP</th>
                                <th className="px-4 py-3 font-medium">P&L</th>
                                <th className="px-4 py-3 font-medium text-right">Close</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {positions.map(p => {
                                const ltp = p.ltp ?? p.avg_price;
                                const pnl = p.pnl ?? 0;
                                const pnl_pct = p.pnl_pct ?? 0;
                                const isProfitable = pnl >= 0;
                                return (
                                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-200">{p.symbol}</div>
                                            <div className="text-[10px] text-slate-500 mt-0.5 text-ellipsis overflow-hidden max-w-[120px]">
                                                {new Date(p.entry_time).toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.side === 'LONG' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                                                {p.side}
                                            </span>
                                            <span className="ml-2 text-slate-300 font-medium">{p.qty}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300">
                                            <div className="font-medium">₹{(p.avg_price ?? 0).toFixed(2)}</div>
                                            {p.indicators && Object.keys(p.indicators).length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1 max-w-[150px]">
                                                    {Object.entries(p.indicators).map(([k, v]) => (
                                                        <span key={k} className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400 border border-slate-700/50" title={k}>
                                                            <span className="text-slate-500 mr-1">{k}:</span>
                                                            {typeof v === 'number' ? v.toFixed(2) : String(v)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-200 font-medium">
                                            ₹{ltp.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className={`font-bold flex items-center ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {isProfitable ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                                                ₹{Math.abs(pnl).toFixed(2)}
                                            </div>
                                            <div className={`text-[10px] ${isProfitable ? 'text-emerald-500/80' : 'text-red-500/80'}`}>
                                                {isProfitable ? '+' : ''}{pnl_pct.toFixed(2)}%
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => onClosePosition(p.id)}
                                                disabled={closingId === p.id}
                                                className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                                                title="Close Position at Market"
                                            >
                                                {closingId === p.id ? (
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <XCircle className="w-5 h-5" />
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
