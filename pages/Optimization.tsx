
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Zap, Sliders, Play, GitBranch } from 'lucide-react';
import { runOptimization } from '../services/api';
import { OptimizationResult, WFOResult } from '../types';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

const Optimization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'GRID' | 'WFO' | 'OPTUNA'>('GRID');
  const [results, setResults] = useState<{ grid: OptimizationResult[], wfo: WFOResult[] } | null>(null);
  const [running, setRunning] = useState(false);
  
  // Parameter Range State
  const [ranges, setRanges] = useState({
      rsi_period: { min: 14, max: 24, step: 2 },
      rsi_lower: { min: 25, max: 40, step: 5 }
  });

  const handleRun = async () => {
    setRunning(true);
    const res = await runOptimization('NIFTY 50', '1', ranges);
    setResults(res);
    setRunning(false);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Hyperparameter Optimization</h2>
           <p className="text-slate-400 text-sm">Fine-tune strategies using Grid Search, Walk-Forward Analysis, or Optuna TPE.</p>
        </div>
        <div className="flex space-x-2">
            <Button variant={activeTab === 'GRID' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('GRID')} icon={<Sliders className="w-4 h-4"/>}>Grid Search</Button>
            <Button variant={activeTab === 'WFO' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('WFO')} icon={<GitBranch className="w-4 h-4"/>}>WFO</Button>
            <Button variant={activeTab === 'OPTUNA' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('OPTUNA')} icon={<Zap className="w-4 h-4"/>}>Optuna</Button>
        </div>
      </div>

      {!results && !running && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <Card title="Optimization Configuration">
                <div className="space-y-6">
                    <div>
                        <h4 className="text-sm font-medium text-emerald-400 mb-4 uppercase tracking-wider">RSI Period Range</h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Min</label>
                                <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-200"
                                    value={ranges.rsi_period.min}
                                    onChange={(e) => setRanges({...ranges, rsi_period: {...ranges.rsi_period, min: parseInt(e.target.value)}})}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Max</label>
                                <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-200"
                                    value={ranges.rsi_period.max}
                                    onChange={(e) => setRanges({...ranges, rsi_period: {...ranges.rsi_period, max: parseInt(e.target.value)}})}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Step</label>
                                <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-200"
                                    value={ranges.rsi_period.step}
                                    onChange={(e) => setRanges({...ranges, rsi_period: {...ranges.rsi_period, step: parseInt(e.target.value)}})}
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-800">
                        <h4 className="text-sm font-medium text-emerald-400 mb-4 uppercase tracking-wider">Oversold Level Range</h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Min</label>
                                <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-200"
                                    value={ranges.rsi_lower.min}
                                    onChange={(e) => setRanges({...ranges, rsi_lower: {...ranges.rsi_lower, min: parseInt(e.target.value)}})}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">Max</label>
                                <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-200"
                                    value={ranges.rsi_lower.max}
                                    onChange={(e) => setRanges({...ranges, rsi_lower: {...ranges.rsi_lower, max: parseInt(e.target.value)}})}
                                />
                            </div>
                             <div>
                                <label className="text-xs text-slate-500 block mb-1">Step</label>
                                <input type="number" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-200"
                                    value={ranges.rsi_lower.step}
                                    onChange={(e) => setRanges({...ranges, rsi_lower: {...ranges.rsi_lower, step: parseInt(e.target.value)}})}
                                />
                            </div>
                        </div>
                    </div>

                    <Button onClick={handleRun} size="lg" className="w-full py-4 mt-4" icon={<Play className="w-5 h-5" />}>
                        Start Optimization Engine
                    </Button>
                </div>
             </Card>

             <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                 <div className="bg-slate-800 p-6 rounded-full mb-6">
                    <Zap className="w-12 h-12 text-yellow-400 opacity-80" />
                 </div>
                 <h3 className="text-lg font-medium text-slate-200 mb-2">Ready to Compute</h3>
                 <p className="max-w-xs">
                     The engine will test {
                        ((ranges.rsi_period.max - ranges.rsi_period.min)/ranges.rsi_period.step + 1) * 
                        ((ranges.rsi_lower.max - ranges.rsi_lower.min)/ranges.rsi_lower.step + 1)
                     } combinations on the backend using VectorBT broadcasting.
                 </p>
             </div>
         </div>
      )}

      {running && (
          <Card className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
              <h3 className="text-lg font-medium text-slate-200">Running iterations...</h3>
              <p className="text-slate-400 text-sm">Testing permutations on historical data.</p>
          </Card>
      )}

      {results && activeTab === 'GRID' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[500px]">
                  <Card title="Parameter Heatmap (RSI vs Stop Loss)" className="h-full flex flex-col">
                     <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis type="number" dataKey="paramSet.rsi" name="RSI Period" stroke="#64748b" label={{ value: 'RSI Period', position: 'bottom', fill: '#64748b' }} domain={[ranges.rsi_period.min, ranges.rsi_period.max]} />
                                <YAxis type="number" dataKey="paramSet.lower" name="Lower Bound" stroke="#64748b" label={{ value: 'Lower Bound', angle: -90, position: 'insideLeft', fill: '#64748b' }} domain={[ranges.rsi_lower.min, ranges.rsi_lower.max]} />
                                <ZAxis type="number" dataKey="sharpe" range={[100, 600]} name="Sharpe Ratio" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                                <Scatter name="Results" data={results.grid} fill="#10b981" />
                            </ScatterChart>
                        </ResponsiveContainer>
                     </div>
                  </Card>
              </div>
              <div className="space-y-4">
                   <Card title="Top Configurations">
                       <div className="space-y-3">
                           {results.grid.sort((a,b) => b.sharpe - a.sharpe).slice(0, 5).map((res, idx) => (
                               <div key={idx} className="flex justify-between items-center p-3 bg-slate-950 rounded border border-slate-800">
                                   <div>
                                       <div className="text-xs text-slate-500">RSI: {res.paramSet.rsi} | Lower: {res.paramSet.lower}</div>
                                       <div className="text-emerald-400 font-bold">{res.sharpe.toFixed(2)} Sharpe</div>
                                   </div>
                                   <Badge variant="success">+{res.returnPct.toFixed(1)}%</Badge>
                               </div>
                           ))}
                       </div>
                   </Card>
                   <Button variant="secondary" onClick={() => setResults(null)} className="w-full">Back to Config</Button>
              </div>
          </div>
      )}

      {/* ... (WFO and OPTUNA tabs remain similar) ... */}
    </div>
  );
};

export default Optimization;
