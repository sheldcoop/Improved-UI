import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Zap, Sliders, Play, Maximize2, GitBranch } from 'lucide-react';
import { runOptimization } from '../services/api';
import { OptimizationResult, WFOResult } from '../types';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';

const Optimization: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'GRID' | 'WFO' | 'OPTUNA'>('GRID');
  const [results, setResults] = useState<{ grid: OptimizationResult[], wfo: WFOResult[] } | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    const res = await runOptimization();
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
         <Card className="flex flex-col items-center justify-center py-20">
             <div className="bg-slate-800 p-4 rounded-full mb-4">
                 <Sliders className="w-8 h-8 text-emerald-400" />
             </div>
             <h3 className="text-xl font-semibold text-slate-200 mb-2">Configure & Run</h3>
             <p className="text-slate-400 mb-6 max-w-md text-center">Define parameter ranges and objectives to find the most robust strategy configuration.</p>
             <Button onClick={handleRun} size="lg" icon={<Play className="w-5 h-5" />}>Start Optimization Engine</Button>
         </Card>
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
                                <XAxis type="number" dataKey="paramSet.rsi" name="RSI Period" stroke="#64748b" label={{ value: 'RSI Period', position: 'bottom', fill: '#64748b' }} />
                                <YAxis type="number" dataKey="paramSet.stopLoss" name="Stop Loss %" stroke="#64748b" label={{ value: 'Stop Loss %', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
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
                                       <div className="text-xs text-slate-500">RSI: {res.paramSet.rsi} | SL: {res.paramSet.stopLoss}%</div>
                                       <div className="text-emerald-400 font-bold">{res.sharpe.toFixed(2)} Sharpe</div>
                                   </div>
                                   <Badge variant="success">+{res.returnPct.toFixed(1)}%</Badge>
                               </div>
                           ))}
                       </div>
                   </Card>
              </div>
          </div>
      )}

      {results && activeTab === 'WFO' && (
          <div className="space-y-6">
              <Card title="Walk-Forward Analysis (Out-of-Sample Consistency)">
                  <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={results.wfo}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                              <XAxis dataKey="period" stroke="#64748b" />
                              <YAxis stroke="#64748b" />
                              <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                              <Legend />
                              <Bar dataKey="returnPct" name="Return %" fill="#10b981" barSize={50} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </Card>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {results.wfo.map((period, idx) => (
                      <Card key={idx} className="text-center">
                          <div className="text-slate-500 text-xs uppercase mb-1">{period.period}</div>
                          <div className={`text-xl font-bold ${period.returnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {period.returnPct > 0 ? '+' : ''}{period.returnPct.toFixed(2)}%
                          </div>
                          <Badge className="mt-2" variant={period.returnPct > 0 ? 'success' : 'danger'}>
                              Sharpe: {period.sharpe.toFixed(2)}
                          </Badge>
                      </Card>
                  ))}
              </div>
          </div>
      )}
      
      {results && activeTab === 'OPTUNA' && (
           <Card className="flex flex-col items-center justify-center py-20">
               <Zap className="w-16 h-16 text-yellow-400 mb-4 opacity-80" />
               <h3 className="text-xl font-semibold text-slate-200">Optuna Parallel Coordinates</h3>
               <p className="text-slate-500">Visualization of high-dimensional parameter relationships.</p>
               <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-emerald-400">
                   Trial 42: RSI=14, ATR=2.1, EMA=50 -> Objective: 2.45
               </div>
           </Card>
      )}
    </div>
  );
};

export default Optimization;
