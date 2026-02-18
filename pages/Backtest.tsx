import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, DollarSign, Layers, Settings, ChevronDown } from 'lucide-react';
import { MOCK_SYMBOLS } from '../constants';
import { runBacktest } from '../services/api';
import { AssetClass, Timeframe } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [symbol, setSymbol] = useState(MOCK_SYMBOLS[0].symbol);
  
  // Advanced Settings State
  const [slippage, setSlippage] = useState(0.05);
  const [commission, setCommission] = useState(20);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    const result = await runBacktest('1', symbol);
    setRunning(false);
    navigate('/results', { state: { result } });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-100 mb-2">Backtest Engine</h2>
        <p className="text-slate-400">Validate strategy performance against historical market data.</p>
      </div>

      <Card className="p-8 shadow-2xl shadow-black/50">
          <div className="space-y-8">
            
            {/* Strategy Selection Grouped */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                <Layers className="w-4 h-4 mr-2" /> Select Strategy Logic
              </label>
              <select className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all">
                <optgroup label="Trend Following">
                    <option value="3">Moving Average Crossover (Equity)</option>
                    <option value="4">SuperTrend Breakout</option>
                </optgroup>
                <optgroup label="Mean Reversion">
                    <option value="1">RSI Mean Reversion (Equity)</option>
                    <option value="5">Bollinger Band Squeeze</option>
                </optgroup>
                <optgroup label="Volatility / Options">
                     <option value="2">BankNifty Short Straddle (Options)</option>
                     <option value="6">Iron Condor Weekly</option>
                </optgroup>
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

            {/* Advanced Settings Toggle */}
            <div className="border-t border-slate-800 pt-4">
                 <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                 >
                     <Settings className="w-4 h-4 mr-2" />
                     Advanced Configuration
                     <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                 </button>

                 {showAdvanced && (
                     <div className="grid grid-cols-2 gap-6 mt-4 bg-slate-950 p-4 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-top-2">
                         <div>
                             <label className="text-xs text-slate-500 block mb-1">Slippage (%)</label>
                             <input 
                                type="number" step="0.01"
                                value={slippage} onChange={(e) => setSlippage(parseFloat(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" 
                             />
                         </div>
                         <div>
                             <label className="text-xs text-slate-500 block mb-1">Commission (Flat ₹)</label>
                             <input 
                                type="number" 
                                value={commission} onChange={(e) => setCommission(parseFloat(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200" 
                             />
                         </div>
                         <div>
                             <label className="text-xs text-slate-500 block mb-1">Leverage (x)</label>
                             <select className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-200">
                                 <option>1x (Cash)</option>
                                 <option>2x</option>
                                 <option>5x (Intraday)</option>
                             </select>
                         </div>
                         <div className="flex items-center">
                             <input type="checkbox" id="compounding" className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-emerald-500" />
                             <label htmlFor="compounding" className="ml-2 text-sm text-slate-400">Compounding Logic</label>
                         </div>
                     </div>
                 )}
            </div>

            <div className="pt-2">
               <button 
                 onClick={handleRun}
                 disabled={running}
                 className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/40 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
               >
                 {running ? (
                   <>
                     <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                     Running Simulation...
                   </>
                 ) : (
                   <>
                     <PlayCircle className="w-6 h-6 mr-2" />
                     Start Simulation
                   </>
                 )}
               </button>
            </div>
          </div>
      </Card>
    </div>
  );
};

export default Backtest;
