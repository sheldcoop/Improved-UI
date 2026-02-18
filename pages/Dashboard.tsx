import React from 'react';
import { TrendingUp, Activity, AlertCircle, Clock } from 'lucide-react';

const StatCard: React.FC<{ title: string; value: string; change: string; isPositive: boolean; icon: React.ReactNode }> = ({ title, value, change, isPositive, icon }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 bg-slate-800 rounded-lg text-emerald-400">
        {icon}
      </div>
      <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'} bg-slate-950 px-2 py-1 rounded border border-slate-800`}>
        {change}
      </span>
    </div>
    <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-100">{value}</p>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Backtests" 
          value="142" 
          change="+12 this week" 
          isPositive={true} 
          icon={<Activity className="w-5 h-5" />} 
        />
        <StatCard 
          title="Avg Sharpe Ratio" 
          value="1.45" 
          change="+0.2" 
          isPositive={true} 
          icon={<TrendingUp className="w-5 h-5" />} 
        />
        <StatCard 
          title="Strategies" 
          value="8" 
          change="Active" 
          isPositive={true} 
          icon={<Clock className="w-5 h-5" />} 
        />
        <StatCard 
          title="Win Rate" 
          value="58.4%" 
          change="-1.2%" 
          isPositive={false} 
          icon={<AlertCircle className="w-5 h-5" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Recent Backtests</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="bg-slate-950 text-slate-200 uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Strategy</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Sharpe</th>
                  <th className="px-4 py-3 rounded-tr-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">RSI Mean Reversion</td>
                  <td className="px-4 py-3">NIFTY 50</td>
                  <td className="px-4 py-3 text-emerald-400">+12.5%</td>
                  <td className="px-4 py-3">1.82</td>
                  <td className="px-4 py-3"><span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs border border-emerald-500/20">Completed</span></td>
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">MACD Crossover</td>
                  <td className="px-4 py-3">BANKNIFTY</td>
                  <td className="px-4 py-3 text-red-400">-3.2%</td>
                  <td className="px-4 py-3">0.45</td>
                  <td className="px-4 py-3"><span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs border border-emerald-500/20">Completed</span></td>
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">Bollinger Squeeze</td>
                  <td className="px-4 py-3">RELIANCE</td>
                  <td className="px-4 py-3 text-emerald-400">+8.1%</td>
                  <td className="px-4 py-3">1.20</td>
                  <td className="px-4 py-3"><span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs border border-emerald-500/20">Completed</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">System Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
               <span className="text-sm text-slate-400">Dhan API</span>
               <span className="flex items-center text-emerald-400 text-xs font-medium">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                 Connected
               </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
               <span className="text-sm text-slate-400">Data Cache</span>
               <span className="flex items-center text-emerald-400 text-xs font-medium">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                 Synced (240MB)
               </span>
            </div>
             <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
               <span className="text-sm text-slate-400">Backend Core</span>
               <span className="flex items-center text-emerald-400 text-xs font-medium">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                 Running (vbt-pro)
               </span>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-800">
             <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20">
               Run New Backtest
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
