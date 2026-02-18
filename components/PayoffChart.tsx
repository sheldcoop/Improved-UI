import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { OptionStrategy } from '../types';

interface PayoffChartProps {
  strategy: OptionStrategy;
}

const PayoffChart: React.FC<PayoffChartProps> = ({ strategy }) => {
  // Generate payoff data
  const data = [];
  const rangePercent = 0.05; // 5% up and down
  const minPrice = strategy.spotPrice * (1 - rangePercent);
  const maxPrice = strategy.spotPrice * (1 + rangePercent);
  const steps = 50;
  const stepSize = (maxPrice - minPrice) / steps;

  for (let price = minPrice; price <= maxPrice; price += stepSize) {
    let totalPnl = 0;
    
    strategy.legs.forEach(leg => {
      let intrinsic = 0;
      if (leg.type === 'CE') {
        intrinsic = Math.max(0, price - leg.strike);
      } else {
        intrinsic = Math.max(0, leg.strike - price);
      }

      // If we bought, PnL is intrinsic value - premium paid
      // If we sold, PnL is premium received - intrinsic value
      if (leg.action === 'BUY') {
        totalPnl += (intrinsic - leg.premium);
      } else {
        totalPnl += (leg.premium - intrinsic);
      }
    });

    data.push({
      price: Math.round(price),
      pnl: totalPnl
    });
  }

  const maxProfit = Math.max(...data.map(d => d.pnl));
  const maxLoss = Math.min(...data.map(d => d.pnl));

  return (
    <div className="w-full h-full flex flex-col">
       <div className="flex justify-between text-xs text-slate-400 mb-2 px-4">
          <div>Max Profit: <span className="text-emerald-400 font-bold">₹{maxProfit.toFixed(0)}</span></div>
          <div>Max Loss: <span className="text-red-400 font-bold">₹{maxLoss.toFixed(0)}</span></div>
       </div>
       <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="50%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="50%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="price" stroke="#64748b" fontSize={11} tickFormatter={(val) => val.toFixed(0)} />
            <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `₹${val}`} />
            <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                formatter={(value: number) => [`₹${value.toFixed(2)}`, 'PnL']}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="pnl" stroke="#6366f1" fill="url(#splitColor)" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
       </div>
    </div>
  );
};

export default PayoffChart;
