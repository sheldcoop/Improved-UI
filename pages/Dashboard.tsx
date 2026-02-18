import React from 'react';
import { TrendingUp, Activity, Clock, Zap, BarChart3, Layers } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MOCK_SYMBOLS } from '../constants';

const StatCard: React.FC<{ title: string; value: string; change: string; isPositive: boolean; icon: React.ReactNode }> = ({ title, value, change, isPositive, icon }) => (
  <Card className="hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 bg-slate-800 rounded-lg text-emerald-400">
        {icon}
      </div>
      <Badge variant={isPositive ? 'success' : 'danger'}>{change}</Badge>
    </div>
    <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-100">{value}</p>
  </Card>
);

const MarketRegimeWidget = () => (
    <Card title={<><Zap className="w-4 h-4 mr-2 text-yellow-400 inline" /> Market Regime</>}>
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
    </Card>
);

const VolatilityList = () => (
    <Card title={<><Activity className="w-4 h-4 mr-2 text-orange-400 inline" /> IV Percentile Watch</>}>
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
                            <Badge variant={s.ivPercentile > 80 ? 'danger' : s.ivPercentile < 20 ? 'success' : 'warning'}>
                                {s.ivPercentile > 80 ? 'Sell Vol' : s.ivPercentile < 20 ? 'Buy Vol' : 'Neutral'}
                            </Badge>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </Card>
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
          
          <Card title={<><Layers className="w-4 h-4 mr-2 text-indigo-400 inline" /> Sector Heatmap</>}>
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
            </div>
            <div className="bg-slate-800/50 p-2 rounded text-center text-xs text-slate-500 mt-4">
                Strong Correlation detected between IT & Pharma (0.82)
            </div>
          </Card>

          <VolatilityList />
      </div>

      {/* Main Backtest Table Area */}
      <Card 
        title="Recent Simulations" 
        action={<Button variant="ghost" size="sm">View All</Button>}
      >
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
                  <td className="px-4 py-3"><Badge variant="info">OPTIONS</Badge></td>
                  <td className="px-4 py-3">NIFTY 50</td>
                  <td className="px-4 py-3 text-emerald-400">+4.5%</td>
                  <td className="px-4 py-3">2.10</td>
                  <td className="px-4 py-3 text-red-400">-1.2%</td>
                  <td className="px-4 py-3"><Badge variant="success">Completed</Badge></td>
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">RSI Mean Reversion</td>
                   <td className="px-4 py-3"><Badge variant="info">EQUITY</Badge></td>
                  <td className="px-4 py-3">RELIANCE</td>
                  <td className="px-4 py-3 text-emerald-400">+12.5%</td>
                  <td className="px-4 py-3">1.82</td>
                   <td className="px-4 py-3 text-red-400">-8.5%</td>
                  <td className="px-4 py-3"><Badge variant="success">Completed</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
    </div>
  );
};

export default Dashboard;
