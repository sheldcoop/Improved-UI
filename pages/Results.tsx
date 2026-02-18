import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { BacktestResult } from '../types';
import { ArrowUpRight, ArrowDownRight, Maximize2 } from 'lucide-react';

const MetricBox: React.FC<{ label: string; value: string; subValue?: string; good?: boolean }> = ({ label, value, subValue, good }) => (
  <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
    <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{label}</div>
    <div className={`text-2xl font-bold ${good === undefined ? 'text-slate-100' : good ? 'text-emerald-400' : 'text-red-400'}`}>
      {value}
    </div>
    {subValue && <div className="text-slate-500 text-xs mt-1">{subValue}</div>}
  </div>
);

const Results: React.FC = () => {
  const location = useLocation();
  const result = location.state?.result as BacktestResult;

  if (!result) {
    // If no result in state, redirect or show mock for dev
    // For this example, we'll allow a mock fallback if state is empty, or redirect.
    // Let's redirect to backtest page for robustness.
    // return <Navigate to="/backtest" />;
    
    // Actually, let's show a mock result for visual demonstration if user navigates directly
    return <Navigate to="/backtest" replace />;
  }

  const data = result.equityCurve;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <div className="flex items-center space-x-2 text-sm text-slate-500 mb-1">
             <span>{result.strategyName}</span>
             <span>•</span>
             <span>{result.symbol}</span>
             <span>•</span>
             <span>{result.timeframe}</span>
           </div>
           <h2 className="text-2xl font-bold text-slate-100">Backtest Results</h2>
        </div>
        <div className="flex space-x-3">
          <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Export CSV
          </button>
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20">
            Generate PDF Report
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <MetricBox label="Total Return" value={`${result.metrics.totalReturnPct}%`} good={result.metrics.totalReturnPct > 0} />
        <MetricBox label="CAGR" value={`${result.metrics.cagr}%`} />
        <MetricBox label="Sharpe Ratio" value={result.metrics.sharpeRatio.toFixed(2)} good={result.metrics.sharpeRatio > 1.5} />
        <MetricBox label="Max Drawdown" value={`-${result.metrics.maxDrawdownPct}%`} good={result.metrics.maxDrawdownPct < 20} />
        <MetricBox label="Win Rate" value={`${result.metrics.winRate}%`} subValue={`${result.metrics.totalTrades} Trades`} />
        <MetricBox label="Profit Factor" value={result.metrics.profitFactor.toFixed(2)} />
        <MetricBox label="Expectancy" value="1.2R" />
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve - Takes up 2 columns */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-200">Equity Curve</h3>
            <button className="text-slate-500 hover:text-slate-300"><Maximize2 className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 w-full min-h-0">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                 <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
                 <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                   itemStyle={{ color: '#10b981' }}
                   formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Portfolio Value']}
                 />
                 <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Drawdown Chart - Takes up 1 column */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-[400px] flex flex-col">
          <h3 className="font-semibold text-slate-200 mb-4">Underwater Plot</h3>
          <div className="flex-1 w-full min-h-0">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                 <XAxis dataKey="date" hide />
                 <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                 <Area type="stepAfter" dataKey="drawdown" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Trade List Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
           <h3 className="font-semibold text-slate-200">Recent Trades</h3>
           <button className="text-sm text-emerald-400 hover:text-emerald-300">View All Trades</button>
        </div>
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="bg-slate-950 text-slate-200 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3">Price</th>
              <th className="px-6 py-3">PnL</th>
              <th className="px-6 py-3">R-Multiple</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
             {/* Mock Rows */}
             <tr className="hover:bg-slate-800/50">
               <td className="px-6 py-4">2023-04-10</td>
               <td className="px-6 py-4 text-emerald-400">LONG</td>
               <td className="px-6 py-4">18,240.50</td>
               <td className="px-6 py-4 text-emerald-400 flex items-center"><ArrowUpRight className="w-4 h-4 mr-1" /> +₹4,250</td>
               <td className="px-6 py-4">2.1R</td>
             </tr>
             <tr className="hover:bg-slate-800/50">
               <td className="px-6 py-4">2023-04-05</td>
               <td className="px-6 py-4 text-red-400">SHORT</td>
               <td className="px-6 py-4">18,100.00</td>
               <td className="px-6 py-4 text-red-400 flex items-center"><ArrowDownRight className="w-4 h-4 mr-1" /> -₹2,100</td>
               <td className="px-6 py-4">-1.0R</td>
             </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Results;
