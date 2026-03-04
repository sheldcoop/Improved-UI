import React from 'react';
import { History, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { Card } from '../ui/Card';

export interface TradeHistoryItem {
    id: string;
    monitor_id: string | null;
    symbol: string;
    side: 'LONG' | 'SHORT';
    qty: number;
    entry_price: number;
    exit_price: number;
    pnl: number;
    pnl_pct: number;
    entry_time: string;
    exit_time: string;
    exit_reason: string;
}

interface TradeHistoryProps {
    history: TradeHistoryItem[];
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({ history }) => {
    const totalPnl = history.reduce((sum, h) => sum + h.pnl, 0);
    const winRate = history.length > 0
        ? (history.filter(h => h.pnl > 0).length / history.length) * 100
        : 0;

    return (
        <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card className="p-3 flex flex-col justify-center">
                    <div className="text-xs text-slate-500 mb-1">Total Trades</div>
                    <div className="text-xl font-bold text-slate-200">{history.length}</div>
                </Card>
                <Card className="p-3 flex flex-col justify-center">
                    <div className="text-xs text-slate-500 mb-1">Win Rate</div>
                    <div className="text-xl font-bold text-slate-200">{winRate.toFixed(1)}%</div>
                </Card>
                <Card className="p-3 flex flex-col justify-center">
                    <div className="text-xs text-slate-500 mb-1">Net P&L</div>
                    <div className={`text-xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
                    </div>
                </Card>
            </div>

            {/* History Table */}
            <Card title="Trade History" className="p-0 overflow-hidden" icon={<History className="w-4 h-4 text-emerald-500 mr-2" />}>
                {history.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <p className="text-sm">No closed trades yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Symbol/Time</th>
                                    <th className="px-4 py-3 font-medium">Side/Qty</th>
                                    <th className="px-4 py-3 font-medium">Entry</th>
                                    <th className="px-4 py-3 font-medium">Exit</th>
                                    <th className="px-4 py-3 font-medium">P&L</th>
                                    <th className="px-4 py-3 font-medium text-right">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {history.map(h => {
                                    const isProfitable = h.pnl >= 0;
                                    return (
                                        <tr key={h.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-200">{h.symbol}</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    In: {new Date(h.entry_time).toLocaleString()}<br />
                                                    Out: {new Date(h.exit_time).toLocaleString()}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${h.side === 'LONG' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                                                    {h.side}
                                                </span>
                                                <span className="ml-2 text-slate-300 font-medium">{h.qty}</span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-300 text-xs">
                                                ₹{h.entry_price.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-slate-300 text-xs">
                                                ₹{h.exit_price.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className={`font-bold flex items-center ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {isProfitable ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                                                    ₹{Math.abs(h.pnl).toFixed(2)}
                                                </div>
                                                <div className={`text-[10px] ${isProfitable ? 'text-emerald-500/80' : 'text-red-500/80'}`}>
                                                    {isProfitable ? '+' : ''}{h.pnl_pct.toFixed(2)}%
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`px-2 py-1 rounded text-[10px] font-medium border ${h.exit_reason === 'SL' ? 'bg-red-900/20 text-red-400 border-red-800' : h.exit_reason === 'TP' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                                    {h.exit_reason === 'SIGNAL' ? 'Strategy Exit' : h.exit_reason}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};
