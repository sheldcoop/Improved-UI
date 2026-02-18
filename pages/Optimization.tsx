
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Zap, Sliders, Play, GitBranch, Repeat } from 'lucide-react';
import { runOptimization } from '../services/api';
import { runWFO } from '../services/backtestService'; // Import WFO service
import { OptimizationResult, WFOResult } from '../types';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend, LineChart, Line } from 'recharts';

const Optimization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'GRID' | 'WFO'>('GRID');
  const [results, setResults] = useState<{ grid: OptimizationResult[], wfo: WFOResult[] } | null>(null);
  const [running, setRunning] = useState(false);
  
  // Parameter Range State
  const [ranges, setRanges] = useState({
      rsi_period: { min: 14, max: 24, step: 2 },
      rsi_lower: { min: 25, max: 40, step: 5 }
  });

  // WFO State
  const [wfoConfig, setWfoConfig] = useState({
      trainWindow: 100, // days
      testWindow: 30,   // days
      windows: 5
  });

  const handleRun = async () => {
    setRunning(true);
    if (activeTab === 'GRID') {
        const res = await runOptimization('NIFTY 50', '1', ranges);
        setResults(res);
    } else {
        const wfoRes = await runWFO('NIFTY 50', '1', wfoConfig);
        setResults({ grid: [], wfo: wfoRes });
    }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Hyperparameter Optimization</h2>
           <p className="text-slate-400 text-sm">Fine-tune strategies using Grid Search or Walk-Forward Analysis.</p>
        </div>
        <div className="flex space-x-2">
            <Button variant={activeTab === 'GRID' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('GRID')} icon={<Sliders className="w-4 h-4"/>}>Grid Search</Button>
            <Button variant={activeTab === 'WFO' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('WFO')} icon={<GitBranch className="w-4 h-4"/>}>WFO</Button>
        </div>
      </div>

      {!results && !running && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <Card title={activeTab === 'GRID' ? "Grid Configuration" : "WFO Configuration"}>
                <div className="space-y-6">
                    {activeTab === 'GRID' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <div className="p-4 bg-slate-950 rounded border border-slate-800 mb-4">
                                <h4 className="text-slate-300 font-medium flex items-center mb-2">
                                    <Repeat className="w-4 h-4 mr-2 text-indigo-400"/> Walk-Forward Logic
                                </h4>
                                <p className="text-xs text-slate-500">
                                    The engine will train on a window, optimize parameters, and then test on the subsequent "Out-of-Sample" window.
                                    This process repeats to verify if the strategy edge persists in unknown data.
                                </p>
                            </div>
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
                        </>
                    )}

                    <Button onClick={handleRun} size="lg" className="w-full py-4 mt-4" icon={<Play className="w-5 h-5" />}>
                        Start {activeTab === 'GRID' ? 'Optimization' : 'Walk-Forward'} Engine
                    </Button>
                </div>
             </Card>
             
             <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                 <div className="bg-slate-800 p-6 rounded-full mb-6">
                    <Zap className="w-12 h-12 text-yellow-400 opacity-80" />
                 </div>
                 <h3 className="text-lg font-medium text-slate-200 mb-2">Ready to Compute</h3>
                 <p className="max-w-xs">
                    {activeTab === 'GRID' ? 'Testing parameter permutations on historical data.' : 'Simulating rolling window analysis to detect overfitting.'}
                 </p>
             </div>
         </div>
      )}

      {running && (
          <Card className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
              <h3 className="text-lg font-medium text-slate-200">Running iterations...</h3>
              <p className="text-slate-400 text-sm">Processing heavy vector calculations.</p>
          </Card>
      )}

      {results && activeTab === 'GRID' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[500px]">
                  <Card title="Parameter Heatmap" className="h-full flex flex-col">
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

      {results && activeTab === 'WFO' && (
          <div className="grid grid-cols-1 gap-6">
              <Card title="Out-of-Sample Performance">
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
              
              <Card title="WFO Iteration Log">
                   <table className="w-full text-left text-sm text-slate-400">
                       <thead className="bg-slate-950 text-slate-200">
                           <tr>
                               <th className="p-3">Period</th>
                               <th className="p-3">Best Params (From Train)</th>
                               <th className="p-3">Test Sharpe</th>
                               <th className="p-3">Test Return</th>
                               <th className="p-3">Status</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800">
                           {results.wfo.map((res, idx) => (
                               <tr key={idx}>
                                   <td className="p-3">{res.period}</td>
                                   <td className="p-3 font-mono text-xs">{res.params}</td>
                                   <td className="p-3">{res.sharpe}</td>
                                   <td className={`p-3 font-bold ${res.returnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                       {res.returnPct}%
                                   </td>
                                   <td className="p-3"><Badge variant="info">Completed</Badge></td>
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
