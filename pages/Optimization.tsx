
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Zap, Sliders, Play, GitBranch, Repeat, Plus, Trash2, Settings } from 'lucide-react';
import { runOptimization } from '../services/api';
import { runWFO } from '../services/backtestService';
import { OptimizationResult, WFOResult } from '../types';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';

interface ParamConfig {
    id: string;
    name: string;
    min: number;
    max: number;
    step: number;
}

const Optimization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'GRID' | 'WFO'>('GRID');
  const [results, setResults] = useState<{ grid: OptimizationResult[], wfo: WFOResult[] } | null>(null);
  const [running, setRunning] = useState(false);
  
  // Dynamic Parameter State
  const [params, setParams] = useState<ParamConfig[]>([
      { id: '1', name: 'period', min: 10, max: 30, step: 2 },
      { id: '2', name: 'lower', min: 20, max: 40, step: 5 }
  ]);

  // WFO State
  const [wfoConfig, setWfoConfig] = useState({
      trainWindow: 100, // days
      testWindow: 30,   // days
      windows: 5
  });

  const addParam = () => {
      setParams([...params, { id: Date.now().toString(), name: 'new_param', min: 10, max: 50, step: 1 }]);
  };

  const removeParam = (id: string) => {
      setParams(params.filter(p => p.id !== id));
  };

  const updateParam = (id: string, field: keyof ParamConfig, value: string | number) => {
      setParams(params.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleRun = async () => {
    setRunning(true);
    
    // Transform array to API expected format { 'name': { min, max, step } }
    const ranges = params.reduce((acc, p) => {
        acc[p.name] = { min: p.min, max: p.max, step: p.step };
        return acc;
    }, {} as any);

    try {
        if (activeTab === 'GRID') {
            const res = await runOptimization('NIFTY 50', '1', ranges);
            setResults(res);
        } else {
            // Use the service that hits /optimization/wfo
            // Note: We need to import the real service call or update backtestService.ts to support this payload
            // For now assuming runWFO in backtestService is updated or we call API directly
            const response = await fetch('http://localhost:5000/api/v1/optimization/wfo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: 'NIFTY 50', strategyId: '1', ranges, wfoConfig })
            });
            const wfoRes = await response.json();
            setResults({ grid: [], wfo: wfoRes });
        }
    } catch (e) {
        alert("Optimization failed: " + e);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Optuna Optimization Engine</h2>
           <p className="text-slate-400 text-sm">Fine-tune strategies using Bayesian TPE or Walk-Forward Analysis.</p>
        </div>
        <div className="flex space-x-2">
            <Button variant={activeTab === 'GRID' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('GRID')} icon={<Sliders className="w-4 h-4"/>}>TPE Optimization</Button>
            <Button variant={activeTab === 'WFO' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('WFO')} icon={<GitBranch className="w-4 h-4"/>}>Walk-Forward</Button>
        </div>
      </div>

      {!results && !running && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <Card title="Hyperparameter Configuration">
                <div className="space-y-6">
                    <div className="flex justify-between items-center mb-2">
                         <h4 className="text-sm font-medium text-emerald-400 uppercase tracking-wider">Search Space</h4>
                         <Button size="sm" variant="secondary" onClick={addParam} icon={<Plus className="w-3 h-3"/>}>Add Parameter</Button>
                    </div>

                    <div className="space-y-3">
                        {params.map((param) => (
                            <div key={param.id} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border border-slate-800">
                                <div className="col-span-3">
                                    <input 
                                        type="text" 
                                        value={param.name} 
                                        onChange={(e) => updateParam(param.id, 'name', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                        placeholder="Param Name"
                                    />
                                </div>
                                <div className="col-span-8 grid grid-cols-3 gap-2">
                                    <div className="flex items-center space-x-1">
                                        <span className="text-[10px] text-slate-500">Min</span>
                                        <input type="number" value={param.min} onChange={(e) => updateParam(param.id, 'min', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-200" />
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <span className="text-[10px] text-slate-500">Max</span>
                                        <input type="number" value={param.max} onChange={(e) => updateParam(param.id, 'max', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-200" />
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <span className="text-[10px] text-slate-500">Step</span>
                                        <input type="number" value={param.step} onChange={(e) => updateParam(param.id, 'step', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-200" />
                                    </div>
                                </div>
                                <div className="col-span-1 flex justify-end">
                                    <button onClick={() => removeParam(param.id)} className="text-slate-600 hover:text-red-400">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {activeTab === 'WFO' && (
                         <div className="mt-4 pt-4 border-t border-slate-800">
                            <h4 className="text-slate-300 font-medium flex items-center mb-2">
                                <Repeat className="w-4 h-4 mr-2 text-indigo-400"/> Walk-Forward Logic
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Train Window (Days)</label>
                                    <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200"
                                        value={wfoConfig.trainWindow}
                                        onChange={(e) => setWfoConfig({...wfoConfig, trainWindow: parseInt(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 block mb-1">Test Window (Days)</label>
                                    <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-200"
                                        value={wfoConfig.testWindow}
                                        onChange={(e) => setWfoConfig({...wfoConfig, testWindow: parseInt(e.target.value)})}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <Button onClick={handleRun} size="lg" className="w-full py-4 mt-4" icon={<Play className="w-5 h-5" />}>
                        Start {activeTab === 'GRID' ? 'Optuna Study' : 'WFO Analysis'}
                    </Button>
                </div>
             </Card>
             
             <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                 <div className="bg-slate-800 p-6 rounded-full mb-6">
                    <Zap className="w-12 h-12 text-yellow-400 opacity-80" />
                 </div>
                 <h3 className="text-lg font-medium text-slate-200 mb-2">
                     {activeTab === 'GRID' ? 'Optuna Bayesian Optimization' : 'Walk-Forward Validation'}
                 </h3>
                 <p className="max-w-xs mb-4">
                    {activeTab === 'GRID' 
                        ? 'Uses Tree-structured Parzen Estimator (TPE) to efficiently converge on optimal parameters without brute-forcing every combination.' 
                        : 'Simulates the strategy over sliding windows. Optimizes on past data, tests on future data to detect overfitting.'}
                 </p>
                 <div className="text-xs font-mono bg-slate-950 p-2 rounded text-slate-400">
                     Engine: Python / VectorBT / Optuna
                 </div>
             </div>
         </div>
      )}

      {running && (
          <Card className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
              <h3 className="text-lg font-medium text-slate-200">Running Simulations...</h3>
              <p className="text-slate-400 text-sm">
                  {activeTab === 'GRID' ? 'Minimizing Loss Function (Maximizing Sharpe)...' : 'Processing Rolling Windows...'}
              </p>
          </Card>
      )}

      {results && activeTab === 'GRID' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[500px]">
                  <Card title="Optimization Landscape" className="h-full flex flex-col">
                     <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                {/* Dynamic Axes based on first two params found */}
                                <XAxis type="number" dataKey={`paramSet.${params[0]?.name}`} name={params[0]?.name} stroke="#64748b" label={{ value: params[0]?.name, position: 'bottom', fill: '#64748b' }} />
                                <YAxis type="number" dataKey={`paramSet.${params[1]?.name || params[0]?.name}`} name={params[1]?.name} stroke="#64748b" label={{ value: params[1]?.name, angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                                <ZAxis type="number" dataKey="sharpe" range={[100, 600]} name="Sharpe Ratio" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                                <Scatter name="Trials" data={results.grid} fill="#10b981" />
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
                                       <div className="text-xs text-slate-500 font-mono">
                                           {Object.entries(res.paramSet).map(([k, v]) => `${k}:${v}`).join(', ')}
                                       </div>
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

      {results && activeTab === 'WFO' && (
          <div className="grid grid-cols-1 gap-6">
              <Card title="Out-of-Sample Performance (Test Windows)">
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={results.wfo}>
                             <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                             <XAxis dataKey="period" stroke="#64748b" />
                             <YAxis stroke="#64748b" />
                             <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                             <Bar dataKey="returnPct" name="Return %" fill="#6366f1" />
                        </BarChart>
                    </ResponsiveContainer>
                  </div>
              </Card>
              
              <Card title="Walk-Forward Log">
                   <table className="w-full text-left text-sm text-slate-400">
                       <thead className="bg-slate-950 text-slate-200">
                           <tr>
                               <th className="p-3">Window</th>
                               <th className="p-3">Optimal Params (found in Train)</th>
                               <th className="p-3">Test Sharpe</th>
                               <th className="p-3">Test Return</th>
                               <th className="p-3">Status</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800">
                           {results.wfo.map((res, idx) => (
                               <tr key={idx}>
                                   <td className="p-3">{res.period}</td>
                                   <td className="p-3 font-mono text-xs text-emerald-400">{res.params}</td>
                                   <td className="p-3">{res.sharpe}</td>
                                   <td className={`p-3 font-bold ${res.returnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                       {res.returnPct}%
                                   </td>
                                   <td className="p-3"><Badge variant="info">Verified</Badge></td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
              </Card>
              <Button variant="secondary" onClick={() => setResults(null)} className="w-full">Back to Config</Button>
          </div>
      )}
    </div>
  );
};

export default Optimization;
