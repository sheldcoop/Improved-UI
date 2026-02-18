import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, DollarSign, Layers } from 'lucide-react';
import { MOCK_SYMBOLS } from '../constants';
import { runBacktest } from '../services/api';
import { AssetClass, Timeframe } from '../types';

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [symbol, setSymbol] = useState(MOCK_SYMBOLS[0].symbol);
  
  const handleRun = async () => {
    setRunning(true);
    // In a real app, we would get the actual selected strategy ID
    const result = await runBacktest('1', symbol);
    setRunning(false);
    // Navigate to results with the result object in state or ID in URL
    // For this demo, we'll just go to the results page
    navigate('/results', { state: { result } });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-100 mb-2">Run Backtest</h2>
        <p className="text-slate-400">Configure parameters and simulate your strategy on historical data.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
        <div className="p-8 space-y-8">
          
          {/* Strategy Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
              <Layers className="w-4 h-4 mr-2" /> Select Strategy
            </label>
            <select className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all">
              <option value="1">RSI Mean Reversion (Equity)</option>
              <option value="2">BankNifty Short Straddle (Options)</option>
              <option value="3">Moving Average Crossover (Equity)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Symbol & Timeframe */}
            <div className="space-y-6">
               <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Symbol</label>
                <div className="relative">
                  <select 
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                  >
                    {MOCK_SYMBOLS.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol} ({s.exchange})</option>)}
                  </select>
                </div>
              </div>
               <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Timeframe</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(Timeframe).map(tf => (
                    <button key={tf} className={`py-2 rounded-lg text-sm font-medium border ${tf === Timeframe.D1 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dates & Capital */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                   <Calendar className="w-4 h-4 mr-2" /> Date Range
                </label>
                <div className="flex space-x-2">
                   <input type="date" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" defaultValue="2023-01-01" />
                   <span className="text-slate-600 self-center">-</span>
                   <input type="date" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" defaultValue="2023-12-31" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                   <DollarSign className="w-4 h-4 mr-2" /> Initial Capital
                </label>
                <input 
                  type="number" 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                  defaultValue={100000}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800">
             <div className="flex items-center justify-between text-sm text-slate-500 mb-6 bg-slate-950/50 p-4 rounded-lg">
                <span>Brokerage Model: <span className="text-slate-300">Zerodha (0.1% / Flat 20)</span></span>
                <span>Slippage: <span className="text-slate-300">0.05%</span></span>
             </div>
             
             <button 
               onClick={handleRun}
               disabled={running}
               className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/40 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
             >
               {running ? (
                 <>
                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                   Running VectorBT Engine...
                 </>
               ) : (
                 <>
                   <PlayCircle className="w-6 h-6 mr-2" />
                   Start Backtest
                 </>
               )}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Backtest;
