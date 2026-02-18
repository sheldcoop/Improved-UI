
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, DollarSign, Layers, Settings, ChevronDown, Clock } from 'lucide-react';
import { MOCK_SYMBOLS } from '../constants';
import { runBacktest } from '../services/api';
import { Timeframe } from '../types';
import { Card } from '../components/ui/Card';

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [symbol, setSymbol] = useState(MOCK_SYMBOLS[0].symbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.D1);
  const [strategyId, setStrategyId] = useState('1');
  
  // Advanced Settings State
  const [capital, setCapital] = useState(100000);
  const [slippage, setSlippage] = useState(0.05);
  const [commission, setCommission] = useState(20);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    // Pass config to the API including granular timeframe
    // Note: strategyId is passed. If custom rules were needed, StrategyBuilder should be used.
    // This page is for "Quick Backtest" of preset/saved strategies.
    try {
        const result = await runBacktest(strategyId, symbol, {
            capital,
            slippage,
            commission
        });
        // We need to inject the timeframe into the result since the mock might default it
        if (result) result.timeframe = timeframe; 
        navigate('/results', { state: { result } });
    } catch (e) {
        alert("Backtest Failed: " + e);
    } finally {
        setRunning(false);
    }
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
              <select 
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
              >
                <optgroup label="Preset Strategies">
                    <option value="3">Moving Average Crossover (Equity)</option>
                    <option value="1">RSI Mean Reversion (Equity)</option>
                </optgroup>
              </select>
              <p className="text-xs text-slate-500 mt-2">
                 To test custom rules, use the <span className="text-emerald-400 cursor-pointer hover:underline" onClick={() => navigate('/strategy')}>Strategy Builder</span>.
              </p>
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
                  <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center">
                     <Clock className="w-4 h-4 mr-2" /> Timeframe
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.values(Timeframe).map(tf => (
                      <button 
                        key={tf} 
                        onClick={() => setTimeframe(tf)}
                        className={`py-2 rounded-lg text-sm font-medium border transition-colors ${timeframe === tf ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                      >
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
                    value={capital}
                    onChange={(e) => setCapital(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
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
