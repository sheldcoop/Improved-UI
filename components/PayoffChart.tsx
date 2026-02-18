import React from 'react';
import { AreaChart, Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import { OptionStrategy } from '../types';

interface PayoffChartProps {
  strategy: OptionStrategy;
  scenarioIvChange?: number;
  scenarioDaysToExpiry?: number;
}

const PayoffChart: React.FC<PayoffChartProps> = ({ strategy, scenarioIvChange = 0, scenarioDaysToExpiry = 0 }) => {
  // Generate payoff data
  const data = [];
  const rangePercent = 0.05; // 5% up and down
  const minPrice = strategy.spotPrice * (1 - rangePercent);
  const maxPrice = strategy.spotPrice * (1 + rangePercent);
  const steps = 60;
  const stepSize = (maxPrice - minPrice) / steps;

  for (let price = minPrice; price <= maxPrice; price += stepSize) {
    let expiryPnl = 0;
    let t0Pnl = 0;
    
    strategy.legs.forEach(leg => {
      // 1. Expiry PnL
      let intrinsic = 0;
      if (leg.type === 'CE') {
        intrinsic = Math.max(0, price - leg.strike);
      } else {
        intrinsic = Math.max(0, leg.strike - price);
      }

      if (leg.action === 'BUY') {
        expiryPnl += (intrinsic - leg.premium);
      } else {
        expiryPnl += (leg.premium - intrinsic);
      }

      // 2. T+0 PnL Approximation (Scenario Analysis)
      // This is a simplified "fake" Black-Scholes curve for visual demonstration
      // In a real app, this would use the BS formula with IV + scenarioIvChange and Time - scenarioDaysToExpiry
      const distance = Math.abs(price - leg.strike);
      const money = leg.type === 'CE' ? price - leg.strike : leg.strike - price;
      
      // Rough simulation of time value decay curve
      // As scenarioDaysToExpiry increases (closer to expiry), the curve flattens towards the expiry line
      const timeFactor = Math.max(0.1, 1 - (scenarioDaysToExpiry / 30)); // 30 day basis
      const volatilityFactor = 1 + (scenarioIvChange / 100);
      
      // Simulated Option Price (very rough approximation for visual curve)
      let simPrice = 0;
      if (money > 0) {
           simPrice = money + (Math.exp(-distance/ (500 * volatilityFactor)) * 100 * timeFactor);
      } else {
           simPrice = (Math.exp(-distance/ (500 * volatilityFactor)) * 100 * timeFactor);
      }
      
      if (leg.action === 'BUY') {
          t0Pnl += (simPrice - leg.premium);
      } else {
          t0Pnl += (leg.premium - simPrice);
      }

    });

    data.push({
      price: Math.round(price),
      expiryPnl: Math.round(expiryPnl),
      t0Pnl: Math.round(t0Pnl) // Simulated Current PnL
    });
  }

  const maxProfit = Math.max(...data.map(d => d.expiryPnl));
  const maxLoss = Math.min(...data.map(d => d.expiryPnl));

  return (
    <div className="w-full h-full flex flex-col">
       <div className="flex justify-between text-xs text-slate-400 mb-2 px-4">
          <div>Max Profit: <span className="text-emerald-400 font-bold">₹{maxProfit.toFixed(0)}</span></div>
          <div>Max Loss: <span className="text-red-400 font-bold">₹{maxLoss.toFixed(0)}</span></div>
       </div>
       <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            />
            <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}/>
            <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
            
            {/* Expiry Line */}
            <Area 
                type="monotone" 
                dataKey="expiryPnl" 
                name="Expiry P&L"
                stroke="#6366f1" 
                fill="url(#splitColor)" 
                strokeWidth={2} 
            />
            
            {/* T+0 / Scenario Line */}
            <Line 
                type="monotone" 
                dataKey="t0Pnl" 
                name="Projected P&L (T+0)"
                stroke="#f59e0b" 
                strokeWidth={2} 
                dot={false}
                strokeDasharray="5 5"
            />
            </ComposedChart>
        </ResponsiveContainer>
       </div>
    </div>
  );
};

export default PayoffChart;
