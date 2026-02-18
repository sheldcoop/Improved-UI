
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Play, AlertTriangle, Settings } from 'lucide-react';
import { runMonteCarlo } from '../services/api';
import { MonteCarloPath } from '../types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const RiskAnalysis: React.FC = () => {
  const [paths, setPaths] = useState<MonteCarloPath[] | null>(null);
  const [running, setRunning] = useState(false);
  
  // Config State
  const [simulations, setSimulations] = useState(100);
  const [volMultiplier, setVolMultiplier] = useState(1.0);

  const handleRun = async () => {
    setRunning(true);
    const res = await runMonteCarlo(simulations, volMultiplier);
    setPaths(res);
    setRunning(false);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Risk Analysis</h2>
           <p className="text-slate-400 text-sm">Stress test strategies using Monte Carlo simulations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Config Panel */}
          <div className="lg:col-span-1">
             <Card title="Configuration">
                <div className="space-y-5">
                    <div>
                        <label className="text-sm font-medium text-slate-400 mb-2 block">Number of Simulations</label>
                        <select 
                            value={simulations} 
                            onChange={(e) => setSimulations(parseInt(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200"
                        >
                            <option value="50">50 Paths</option>
                            <option value="100">100 Paths</option>
                            <option value="500">500 Paths</option>
                            <option value="1000">1000 Paths (Heavy)</option>
                        </select>
                    </div>
                    
                    <div>
                         <label className="text-sm font-medium text-slate-400 mb-2 block">Volatility Stress Test</label>
                         <div className="flex items-center space-x-3 mb-2">
                             <input 
                                type="range" min="0.5" max="3.0" step="0.1" 
                                value={volMultiplier}
                                onChange={(e) => setVolMultiplier(parseFloat(e.target.value))}
                                className="flex-1"
                             />
                             <span className="font-mono text-emerald-400">{volMultiplier}x</span>
                         </div>
                         <p className="text-xs text-slate-500">Multiplier applied to historical volatility (Sigma).</p>
                    </div>

                    <Button onClick={handleRun} disabled={running} className="w-full py-3" icon={<Play className="w-4 h-4"/>}>
                        {running ? 'Simulating...' : 'Run Simulation'}
                    </Button>
                </div>
             </Card>
          </div>

          <div className="lg:col-span-3">
              <Card title={`Monte Carlo Paths (${simulations} iterations)`} className="h-[500px] flex flex-col">
                 {!paths ? (
                     <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                         <Settings className="w-12 h-12 mb-3 opacity-20" />
                         <p>Configure settings and click run to generate risk paths.</p>
                     </div>
                 ) : (
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="index" type="category" allowDuplicatedCategory={false} stroke="#64748b" />
                                <YAxis stroke="#64748b" domain={['auto', 'auto']} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                                {paths.slice(0, 50).map((path) => ( // Limit rendering to 50 lines to prevent UI lag
                                    <Line 
                                        key={path.id} 
                                        data={path.values.map((v, i) => ({ index: i, value: v }))} 
                                        dataKey="value" 
                                        stroke={path.values[path.values.length-1] > 100 ? '#10b981' : '#ef4444'} 
                                        strokeWidth={1} 
                                        strokeOpacity={0.4} 
                                        dot={false} 
                                        isAnimationActive={false}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                        {paths.length > 50 && <div className="text-center text-xs text-slate-600 mt-2">* Showing first 50 paths for performance</div>}
                    </div>
                 )}
              </Card>
          </div>
      </div>
    </div>
  );
};

export default RiskAnalysis;
