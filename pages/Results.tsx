import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { BacktestResult } from '../types';
import { ArrowUpRight, ArrowDownRight, Maximize2, Calendar, AlertTriangle, Dice5 } from 'lucide-react';
import { MONTH_NAMES } from '../constants';

const MetricBox: React.FC<{ label: string; value: string; subValue?: string; good?: boolean; icon?: React.ReactNode }> = ({ label, value, subValue, good, icon }) => (
  <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg hover:border-slate-700 transition-colors">
    <div className="flex justify-between items-start mb-1">
      <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold">{label}</div>
      {icon && <div className="text-slate-500 opacity-70">{icon}</div>}
    </div>
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
    return <Navigate to="/backtest" replace />;
  }

  const data = result.equityCurve;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <div className="flex items-center space-x-2 text-sm text-slate-500 mb-1">
             <span className="bg-slate-800 px-2 py-0.5 rounded text-xs">{result.symbol}</span>
             <span>•</span>
             <span>{result.timeframe}</span>
           </div>
           <h2 className="text-2xl font-bold text-slate-100">{result.strategyName}</h2>
        </div>
        <div className="flex space-x-3">
          <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center">
             <Dice5 className="w-4 h-4 mr-2" /> Monte Carlo
          </button>
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20">
            Full Report
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricBox label="Total Return" value={`${result.metrics.totalReturnPct}%`} good={result.metrics.totalReturnPct > 0} />
        <MetricBox label="CAGR" value={`${result.metrics.cagr}%`} />
        <MetricBox label="Sharpe" value={result.metrics.sharpeRatio.toFixed(2)} good={result.metrics.sharpeRatio > 1.5} />
        <MetricBox label="Sortino" value={result.metrics.sortinoRatio.toFixed(2)} />
        <MetricBox label="Profit Factor" value={result.metrics.profitFactor.toFixed(2)} />
        <MetricBox label="Kelly Criterion" value={`${(result.metrics.kellyCriterion * 100).toFixed(1)}%`} subValue="Recommended Risk" />
      </div>

       {/* Drawdown & Risk Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricBox label="Max Drawdown" value={`-${result.metrics.maxDrawdownPct}%`} good={result.metrics.maxDrawdownPct < 20} icon={<AlertTriangle className="w-4 h-4" />} />
        <MetricBox label="Avg DD Duration" value={result.metrics.avgDrawdownDuration} subValue="Recovery Time" />
        <MetricBox label="Calmar Ratio" value={result.metrics.calmarRatio.toFixed(2)} />
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

        {/* Monthly Heatmap - Takes up 1 column */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-[400px] flex flex-col">
          <h3 className="font-semibold text-slate-200 mb-4 flex items-center">
              <Calendar className="w-4 h-4 mr-2" /> Monthly Returns
          </h3>
          <div className="grid grid-cols-4 gap-2 flex-1 content-start">
             {result.monthlyReturns?.map((m, idx) => {
                 // Determine color intensity based on return
                 let colorClass = "bg-slate-800 text-slate-500";
                 if (m.returnPct > 0) {
                     if (m.returnPct > 5) colorClass = "bg-emerald-500 text-white font-bold";
                     else if (m.returnPct > 2) colorClass = "bg-emerald-600/80 text-white";
                     else colorClass = "bg-emerald-900/60 text-emerald-200";
                 } else if (m.returnPct < 0) {
                      if (m.returnPct < -5) colorClass = "bg-red-500 text-white font-bold";
                     else if (m.returnPct < -2) colorClass = "bg-red-600/80 text-white";
                     else colorClass = "bg-red-900/60 text-red-200";
                 }

                 return (
                     <div key={idx} className={`rounded-md p-2 flex flex-col items-center justify-center text-xs ${colorClass}`}>
                         <span className="opacity-70 text-[10px] uppercase">{MONTH_NAMES[m.month]}</span>
                         <span>{m.returnPct > 0 ? '+' : ''}{m.returnPct.toFixed(1)}%</span>
                     </div>
                 );
             })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;