import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ArrowRight, Zap, RefreshCw, BarChart2 } from 'lucide-react';
import PayoffChart from '../components/PayoffChart';
import { OptionStrategy, OptionLeg } from '../types';
import { getOptionChain } from '../services/api';

const OptionsBuilder: React.FC = () => {
  const [underlying, setUnderlying] = useState('NIFTY 50');
  const [expiry, setExpiry] = useState('29-Feb-2024');
  const [spotPrice, setSpotPrice] = useState(22150);
  const [strategyName, setStrategyName] = useState('Custom Strategy');
  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [optionChain, setOptionChain] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initial Strategy: Iron Condor
    setLegs([
        { id: '1', type: 'PE', action: 'BUY', strike: 21900, expiry: expiry, premium: 45, iv: 18, delta: -0.15, theta: -2 },
        { id: '2', type: 'PE', action: 'SELL', strike: 22000, expiry: expiry, premium: 85, iv: 17, delta: -0.30, theta: -5 },
        { id: '3', type: 'CE', action: 'SELL', strike: 22300, expiry: expiry, premium: 75, iv: 16, delta: 0.30, theta: -4 },
        { id: '4', type: 'CE', action: 'BUY', strike: 22400, expiry: expiry, premium: 35, iv: 17, delta: 0.15, theta: -2 },
    ]);
  }, []);

  useEffect(() => {
    const loadChain = async () => {
        setLoading(true);
        const data = await getOptionChain(underlying, expiry);
        setOptionChain(data);
        setLoading(false);
    };
    loadChain();
  }, [underlying, expiry]);

  const removeLeg = (id: string) => {
    setLegs(legs.filter(l => l.id !== id));
  };

  const addLeg = (type: 'CE' | 'PE', action: 'BUY' | 'SELL', strike: number, premium: number) => {
      const newLeg: OptionLeg = {
          id: Date.now().toString(),
          type,
          action,
          strike,
          expiry,
          premium,
          iv: 15, // Mock defaults
          delta: 0.5,
          theta: -3
      };
      setLegs([...legs, newLeg]);
  };

  const totalPremium = legs.reduce((acc, leg) => acc + (leg.action === 'SELL' ? leg.premium : -leg.premium), 0);
  const totalDelta = legs.reduce((acc, leg) => acc + (leg.action === 'BUY' ? leg.delta : -leg.delta), 0);
  const totalTheta = legs.reduce((acc, leg) => acc + (leg.action === 'BUY' ? leg.theta : -leg.theta), 0);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6">
      
      {/* Left Panel: Strategy & Legs */}
      <div className="w-full lg:w-1/2 flex flex-col gap-6">
        
        {/* Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-4 items-center">
            <div>
                <label className="text-xs text-slate-500 block mb-1">Underlying</label>
                <select 
                    value={underlying} 
                    onChange={(e) => setUnderlying(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                >
                    <option value="NIFTY 50">NIFTY 50</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
                </select>
            </div>
            <div>
                <label className="text-xs text-slate-500 block mb-1">Expiry</label>
                <select 
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                >
                    <option>29-Feb-2024</option>
                    <option>07-Mar-2024</option>
                    <option>28-Mar-2024</option>
                </select>
            </div>
            <div className="flex-1">
                 <label className="text-xs text-slate-500 block mb-1">Strategy Name</label>
                 <input 
                    type="text" 
                    value={strategyName} 
                    onChange={(e) => setStrategyName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                 />
            </div>
            <div className="flex flex-col items-end">
                <span className="text-xs text-slate-500">Spot Price</span>
                <span className="text-lg font-bold text-slate-100">{spotPrice.toLocaleString()}</span>
            </div>
        </div>

        {/* Legs Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-semibold text-slate-200">Strategy Legs</h3>
                <div className="flex space-x-2 text-xs">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">Net Credit: {totalPremium > 0 ? totalPremium.toFixed(2) : 0}</span>
                    <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20">Net Debit: {totalPremium < 0 ? Math.abs(totalPremium).toFixed(2) : 0}</span>
                </div>
            </div>
            <div className="overflow-auto flex-1">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-xs uppercase sticky top-0">
                        <tr>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Strike</th>
                            <th className="px-4 py-3">IV</th>
                            <th className="px-4 py-3">Prem</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {legs.map((leg) => (
                            <tr key={leg.id} className="hover:bg-slate-800/50">
                                <td className="px-4 py-3">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${leg.action === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                        {leg.action}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-200">{leg.type}</td>
                                <td className="px-4 py-3">{leg.strike}</td>
                                <td className="px-4 py-3">{leg.iv}%</td>
                                <td className="px-4 py-3 text-slate-200">{leg.premium}</td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => removeLeg(leg.id)} className="text-slate-600 hover:text-red-400">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Quick Option Chain Picker (Mocked) */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 max-h-48 overflow-auto">
                <div className="text-xs font-semibold text-slate-500 mb-2 uppercase">Quick Add from Chain (ATM ± 2 strikes)</div>
                <div className="grid grid-cols-7 gap-2 text-xs text-center font-mono">
                    <div className="col-span-3 text-emerald-400">CALLS</div>
                    <div className="text-slate-500">STRIKE</div>
                    <div className="col-span-3 text-red-400">PUTS</div>
                    
                    {optionChain.slice(8, 13).map((row, idx) => (
                        <React.Fragment key={idx}>
                            <div className="col-span-1 cursor-pointer hover:bg-emerald-900/30 rounded p-1" onClick={() => addLeg('CE', 'BUY', row.strike, row.cePremium)}>{row.cePremium.toFixed(1)}</div>
                            <div className="col-span-1 cursor-pointer hover:bg-emerald-900/30 rounded p-1" onClick={() => addLeg('CE', 'SELL', row.strike, row.cePremium)}>Sell</div>
                             <div className="col-span-1 text-slate-600">{row.ceOi > 500000 ? '🔥' : ''}</div>

                            <div className="bg-slate-800 text-slate-200 rounded p-1">{row.strike}</div>

                            <div className="col-span-1 text-slate-600">{row.peOi > 500000 ? '🔥' : ''}</div>
                            <div className="col-span-1 cursor-pointer hover:bg-red-900/30 rounded p-1" onClick={() => addLeg('PE', 'SELL', row.strike, row.pePremium)}>Sell</div>
                            <div className="col-span-1 cursor-pointer hover:bg-red-900/30 rounded p-1" onClick={() => addLeg('PE', 'BUY', row.strike, row.pePremium)}>{row.pePremium.toFixed(1)}</div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {/* Right Panel: Analytics & Payoff */}
      <div className="w-full lg:w-1/2 flex flex-col gap-6">
          
          {/* Greeks Panel */}
          <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-slate-500 text-xs uppercase mb-1">Delta</div>
                  <div className={`text-lg font-bold ${totalDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalDelta.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-slate-500 text-xs uppercase mb-1">Theta</div>
                  <div className="text-lg font-bold text-slate-100">{totalTheta.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-slate-500 text-xs uppercase mb-1">Gamma</div>
                  <div className="text-lg font-bold text-slate-100">0.02</div>
              </div>
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="text-slate-500 text-xs uppercase mb-1">Vega</div>
                  <div className="text-lg font-bold text-slate-100">-12.5</div>
              </div>
          </div>

          {/* Payoff Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 min-h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-slate-200 flex items-center">
                      <BarChart2 className="w-4 h-4 mr-2 text-indigo-400" />
                      Payoff Diagram
                  </h3>
                  <button className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex items-center transition-colors">
                      <Zap className="w-3 h-3 mr-1" /> Analyze
                  </button>
              </div>
              <PayoffChart strategy={{ name: strategyName, underlying, spotPrice, legs }} />
          </div>
      </div>
    </div>
  );
};

export default OptionsBuilder;
