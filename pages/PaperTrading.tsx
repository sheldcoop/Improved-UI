import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { getPaperPositions } from '../services/api';
import { PaperPosition } from '../types';
import { RefreshCw, XCircle } from 'lucide-react';

const PaperTrading: React.FC = () => {
  const [positions, setPositions] = useState<PaperPosition[]>([]);

  useEffect(() => {
    const load = async () => {
        const res = await getPaperPositions();
        setPositions(res);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Paper Trading</h2>
           <p className="text-slate-400 text-sm">Live forward testing environment with simulated execution.</p>
        </div>
        <div className="flex items-center space-x-4">
             <div className="text-right">
                 <div className="text-xs text-slate-500 uppercase">Available Margin</div>
                 <div className="text-emerald-400 font-mono font-bold">₹98,450.00</div>
             </div>
             <Button icon={<RefreshCw className="w-4 h-4" />}>Refresh</Button>
        </div>
      </div>

      <Card title="Active Positions" className="min-h-[400px]">
          <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-400">
                  <thead className="bg-slate-950 text-slate-200 uppercase tracking-wider text-xs">
                      <tr>
                          <th className="px-6 py-4">Symbol</th>
                          <th className="px-6 py-4">Side</th>
                          <th className="px-6 py-4 text-right">Qty</th>
                          <th className="px-6 py-4 text-right">Avg Price</th>
                          <th className="px-6 py-4 text-right">LTP</th>
                          <th className="px-6 py-4 text-right">PnL</th>
                          <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                      {positions.map((pos) => (
                          <tr key={pos.id} className="hover:bg-slate-800/50">
                              <td className="px-6 py-4 font-bold text-slate-200">{pos.symbol}</td>
                              <td className="px-6 py-4">
                                  <Badge variant={pos.side === 'LONG' ? 'success' : 'danger'}>{pos.side}</Badge>
                              </td>
                              <td className="px-6 py-4 text-right font-mono">{pos.qty}</td>
                              <td className="px-6 py-4 text-right font-mono">₹{pos.avgPrice}</td>
                              <td className="px-6 py-4 text-right font-mono text-slate-200">₹{pos.ltp}</td>
                              <td className={`px-6 py-4 text-right font-bold font-mono ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {pos.pnl >= 0 ? '+' : ''}₹{pos.pnl} ({pos.pnlPct}%)
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <button className="text-slate-500 hover:text-red-400 transition-colors">
                                      <XCircle className="w-5 h-5" />
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </Card>
    </div>
  );
};

export default PaperTrading;
