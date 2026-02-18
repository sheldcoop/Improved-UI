import React from 'react';
import { TrendingUp, Activity, AlertCircle, Clock, Zap, BarChart3, Layers } from 'lucide-react';
import { MOCK_SYMBOLS } from '../constants';

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

const MarketRegimeWidget = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
            <Zap className="w-4 h-4 mr-2 text-yellow-400" /> Market Regime
        </h3>
        <div className="flex items-center space-x-4 mb-4">
            <div className="flex-1 bg-slate-950 rounded-lg p-3 text-center border border-slate-800">
                <div className="text-xs text-slate-500 uppercase">Short Term</div>
                <div className="text-emerald-400 font-bold">Bullish Trending</div>
            </div>
             <div className="flex-1 bg-slate-950 rounded-lg p-3 text-center border border-slate-800">
                <div className="text-xs text-slate-500 uppercase">Volatility</div>
                <div className="text-red-400 font-bold">Expanding</div>
            </div>
        </div>
        <div className="space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-slate-400">India VIX</span>
                <span className="text-slate-200 font-mono">15.24 <span className="text-green-500">(+2.1%)</span></span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-slate-400">Put/Call Ratio</span>
                <span className="text-slate-200 font-mono">0.85</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 w-[65%]"></div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Bearish</span>
                <span>Bullish</span>
            </div>
        </div>
    </div>
);

const SectorHeatmap = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
         <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
            <Layers className="w-4 h-4 mr-2 text-indigo-400" /> Sector Heatmap
        </h3>
        <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-500/20 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-200">Nifty IT</span>
                <span className="text-emerald-400 font-bold">+1.2%</span>
            </div>
            <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-500/10 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-200">Pharma</span>
                <span className="text-emerald-400 font-bold">+0.4%</span>
            </div>
            <div className="bg-red-900/40 p-3 rounded-lg border border-red-500/20 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-200">Bank</span>
                <span className="text-red-400 font-bold">-0.8%</span>
            </div>
            <div className="bg-red-900/20 p-3 rounded-lg border border-red-500/10 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-200">Auto</span>
                <span className="text-red-400 font-bold">-0.2%</span>
            </div>
            <div className="col-span-2 bg-slate-800/50 p-2 rounded text-center text-xs text-slate-500 mt-2">
                Strong Correlation detected between IT & Pharma (0.82)
            </div>
        </div>
    </div>
);

const VolatilityList = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-orange-400" /> IV Percentile Watch
        </h3>
        <table className="w-full text-left text-sm text-slate-400">
            <thead className="text-xs uppercase bg-slate-950 text-slate-500">
                <tr>
                    <th className="pb-2 pl-2">Symbol</th>
                    <th className="pb-2">IV Rank</th>
                    <th className="pb-2 text-right pr-2">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {MOCK_SYMBOLS.slice(0, 4).map(s => (
                    <tr key={s.symbol}>
                        <td className="py-3 pl-2 font-medium text-slate-200">{s.symbol}</td>
                        <td className="py-3">
                            <div className="flex items-center space-x-2">
                                <span className={`text-xs font-bold ${s.ivPercentile > 80 ? 'text-red-400' : s.ivPercentile < 20 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                    {s.ivPercentile}%
                                </span>
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${s.ivPercentile > 80 ? 'bg-red-500' : s.ivPercentile < 20 ? 'bg-emerald-500' : 'bg-yellow-500'}`} style={{ width: `${s.ivPercentile}%` }}></div>
                                </div>
                            </div>
                        </td>
                        <td className="py-3 text-right pr-2">
                            {s.ivPercentile > 80 ? (
                                <span className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20">Sell Vol</span>
                            ) : s.ivPercentile < 20 ? (
                                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">Buy Vol</span>
                            ) : '-'}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active PnL" value="+₹12,450" change="+1.2%" isPositive={true} icon={<BarChart3 className="w-5 h-5" />} />
        <StatCard title="Total Theta" value="+4,200" change="Daily Decay" isPositive={true} icon={<Clock className="w-5 h-5" />} />
        <StatCard title="Portfolio Delta" value="+125" change="Bullish" isPositive={true} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="Sharpe Ratio" value="2.1" change="Excellent" isPositive={true} icon={<Activity className="w-5 h-5" />} />
      </div>

      {/* Quant Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <MarketRegimeWidget />
          <SectorHeatmap />
          <VolatilityList />
      </div>

      {/* Main Backtest Table Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-semibold text-slate-100">Recent Simulations</h3>
             <button className="text-sm text-emerald-500 hover:text-emerald-400">View All Backtests</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="bg-slate-950 text-slate-200 uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Strategy</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Sharpe</th>
                  <th className="px-4 py-3">Max DD</th>
                  <th className="px-4 py-3 rounded-tr-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">Iron Condor Weekly</td>
                  <td className="px-4 py-3"><span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20">OPTIONS</span></td>
                  <td className="px-4 py-3">NIFTY 50</td>
                  <td className="px-4 py-3 text-emerald-400">+4.5%</td>
                  <td className="px-4 py-3">2.10</td>
                  <td className="px-4 py-3 text-red-400">-1.2%</td>
                  <td className="px-4 py-3"><span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs border border-emerald-500/20">Completed</span></td>
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">RSI Mean Reversion</td>
                   <td className="px-4 py-3"><span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">EQUITY</span></td>
                  <td className="px-4 py-3">RELIANCE</td>
                  <td className="px-4 py-3 text-emerald-400">+12.5%</td>
                  <td className="px-4 py-3">1.82</td>
                   <td className="px-4 py-3 text-red-400">-8.5%</td>
                  <td className="px-4 py-3"><span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs border border-emerald-500/20">Completed</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
};

export default Dashboard;
