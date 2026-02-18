import React, { useMemo } from 'react';
import { AreaChart, Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import { OptionStrategy } from '../types';
import { generatePayoffData } from '../utils/optionsMath';
import { CONFIG } from '../config';

interface PayoffChartProps {
  strategy: OptionStrategy;
  scenarioIvChange?: number;
  scenarioDaysToExpiry?: number;
}

const PayoffChart: React.FC<PayoffChartProps> = ({ strategy, scenarioIvChange = 0, scenarioDaysToExpiry = 0 }) => {
  
  // Memoize heavy calculations
  const { data, maxProfit, maxLoss } = useMemo(() => {
    return generatePayoffData(strategy.legs, strategy.spotPrice, scenarioIvChange, scenarioDaysToExpiry);
  }, [strategy.legs, strategy.spotPrice, scenarioIvChange, scenarioDaysToExpiry]);

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
                  <stop offset="50%" stopColor={CONFIG.COLORS.PROFIT} stopOpacity={0.3} />
                  <stop offset="50%" stopColor={CONFIG.COLORS.LOSS} stopOpacity={0.3} />
                </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CONFIG.COLORS.GRID} />
            <XAxis dataKey="price" stroke={CONFIG.COLORS.TEXT} fontSize={11} tickFormatter={(val) => val.toFixed(0)} />
            <YAxis stroke={CONFIG.COLORS.TEXT} fontSize={11} tickFormatter={(val) => `₹${val}`} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
            <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}/>
            <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
            
            <Area 
                type="monotone" dataKey="expiryPnl" name="Expiry P&L"
                stroke="#6366f1" fill="url(#splitColor)" strokeWidth={2} 
            />
            
            <Line 
                type="monotone" dataKey="t0Pnl" name="Projected P&L (T+0)"
                stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 5"
            />
            </ComposedChart>
        </ResponsiveContainer>
       </div>
    </div>
  );
};

export default PayoffChart;
