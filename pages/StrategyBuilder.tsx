import React, { useState } from 'react';
import { Plus, Trash2, Save, Play, Download } from 'lucide-react';
import { AssetClass, Timeframe, IndicatorType, Operator, Strategy } from '../types';
import { saveStrategy } from '../services/api';

const StrategyBuilder: React.FC = () => {
  const [strategy, setStrategy] = useState<Strategy>({
    id: 'new',
    name: 'Untitled Strategy',
    description: '',
    assetClass: AssetClass.EQUITY,
    timeframe: Timeframe.D1,
    entryRules: [{ id: Date.now().toString(), indicator: IndicatorType.RSI, period: 14, operator: Operator.LESS_THAN, value: 30 }],
    exitRules: [{ id: (Date.now() + 1).toString(), indicator: IndicatorType.RSI, period: 14, operator: Operator.GREATER_THAN, value: 70 }],
    stopLossPct: 2.0,
    takeProfitPct: 5.0,
    created: new Date().toISOString()
  });

  const [saving, setSaving] = useState(false);

  const addRule = (type: 'entry' | 'exit') => {
    const newRule = { id: Date.now().toString(), indicator: IndicatorType.RSI, period: 14, operator: Operator.GREATER_THAN, value: 50 };
    if (type === 'entry') {
      setStrategy({ ...strategy, entryRules: [...strategy.entryRules, newRule] });
    } else {
      setStrategy({ ...strategy, exitRules: [...strategy.exitRules, newRule] });
    }
  };

  const removeRule = (type: 'entry' | 'exit', id: string) => {
    if (type === 'entry') {
      setStrategy({ ...strategy, entryRules: strategy.entryRules.filter(r => r.id !== id) });
    } else {
      setStrategy({ ...strategy, exitRules: strategy.exitRules.filter(r => r.id !== id) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await saveStrategy(strategy);
    setSaving(false);
    alert("Strategy saved successfully (Mock)");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Configuration Panel */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Strategy Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Strategy Name</label>
              <input 
                type="text" 
                value={strategy.name}
                onChange={(e) => setStrategy({...strategy, name: e.target.value})}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
              <textarea 
                value={strategy.description}
                onChange={(e) => setStrategy({...strategy, description: e.target.value})}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 h-24"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Asset Class</label>
                <select 
                  value={strategy.assetClass}
                  onChange={(e) => setStrategy({...strategy, assetClass: e.target.value as AssetClass})}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Timeframe</label>
                <select 
                   value={strategy.timeframe}
                   onChange={(e) => setStrategy({...strategy, timeframe: e.target.value as Timeframe})}
                   className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {Object.values(Timeframe).map(tf => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
               <h3 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wide">Risk Management</h3>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Stop Loss %</label>
                    <input 
                      type="number" 
                      value={strategy.stopLossPct}
                      onChange={(e) => setStrategy({...strategy, stopLossPct: parseFloat(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Take Profit %</label>
                    <input 
                      type="number" 
                      value={strategy.takeProfitPct}
                      onChange={(e) => setStrategy({...strategy, takeProfitPct: parseFloat(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                    />
                 </div>
               </div>
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Strategy'}</span>
          </button>
           <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-4 rounded-lg flex items-center justify-center transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rules Builder */}
      <div className="lg:col-span-2 space-y-6">
        {/* Entry Rules */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-emerald-400 flex items-center">
               <Play className="w-4 h-4 mr-2 fill-current" />
               Entry Conditions
             </h3>
             <button onClick={() => addRule('entry')} className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-1.5 rounded-md flex items-center transition-colors">
               <Plus className="w-3 h-3 mr-1" /> Add Condition
             </button>
           </div>
           
           <div className="space-y-3">
             {strategy.entryRules.map((rule, idx) => (
               <div key={rule.id} className="flex items-center space-x-2 bg-slate-950 p-3 rounded-lg border border-slate-800 group hover:border-slate-700 transition-colors">
                  <span className="text-xs font-mono text-slate-600 w-6">#{idx + 1}</span>
                  <select className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1 focus:border-emerald-500 outline-none">
                    {Object.values(IndicatorType).map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <input type="number" className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1 w-16 focus:border-emerald-500 outline-none" defaultValue={rule.period} />
                  <select className="bg-slate-900 border border-slate-700 text-emerald-400 font-medium text-sm rounded px-2 py-1 focus:border-emerald-500 outline-none">
                    {Object.values(Operator).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input type="text" className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1 w-24 focus:border-emerald-500 outline-none" defaultValue={rule.value} />
                  <div className="flex-1"></div>
                  <button onClick={() => removeRule('entry', rule.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
               </div>
             ))}
             {strategy.entryRules.length === 0 && (
               <div className="text-center py-8 text-slate-600 text-sm border-2 border-dashed border-slate-800 rounded-lg">
                 No entry rules defined. Strategy will never trigger.
               </div>
             )}
           </div>
        </div>

        {/* Exit Rules */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-red-400 flex items-center">
               <div className="w-4 h-4 mr-2 border-2 border-red-400 rounded-sm"></div>
               Exit Conditions
             </h3>
             <button onClick={() => addRule('exit')} className="text-xs bg-slate-800 hover:bg-slate-700 text-red-400 px-3 py-1.5 rounded-md flex items-center transition-colors">
               <Plus className="w-3 h-3 mr-1" /> Add Condition
             </button>
           </div>
           
           <div className="space-y-3">
             {strategy.exitRules.map((rule, idx) => (
               <div key={rule.id} className="flex items-center space-x-2 bg-slate-950 p-3 rounded-lg border border-slate-800 group hover:border-slate-700 transition-colors">
                  <span className="text-xs font-mono text-slate-600 w-6">#{idx + 1}</span>
                  <select className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1 focus:border-emerald-500 outline-none">
                    {Object.values(IndicatorType).map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <input type="number" className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1 w-16 focus:border-emerald-500 outline-none" defaultValue={rule.period} />
                  <select className="bg-slate-900 border border-slate-700 text-emerald-400 font-medium text-sm rounded px-2 py-1 focus:border-emerald-500 outline-none">
                    {Object.values(Operator).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input type="text" className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-1 w-24 focus:border-emerald-500 outline-none" defaultValue={rule.value} />
                  <div className="flex-1"></div>
                  <button onClick={() => removeRule('exit', rule.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
               </div>
             ))}
              {strategy.exitRules.length === 0 && (
               <div className="text-center py-8 text-slate-600 text-sm border-2 border-dashed border-slate-800 rounded-lg">
                 No exit rules defined. Strategy relies solely on SL/TP.
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default StrategyBuilder;
