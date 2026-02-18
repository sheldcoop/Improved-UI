import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Activity, Play, AlertTriangle } from 'lucide-react';
import { runMonteCarlo } from '../services/api';
import { MonteCarloPath } from '../types';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const RiskAnalysis: React.FC = () => {
  const [paths, setPaths] = useState<MonteCarloPath[] | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    const res = await runMonteCarlo(50); // 50 simulations
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
        <Button onClick={handleRun} disabled={running} icon={<Play className="w-4 h-4"/>}>
            {running ? 'Simulating...' : 'Run Monte Carlo'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
              <Card title="Monte Carlo Paths (100 Days)" className="h-[500px] flex flex-col">
                 {!paths ? (
                     <div className="flex-1 flex items-center justify-center text-slate-500">
                         Click Run to generate outcome paths.
                     </div>
                 ) : (
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="index" type="category" allowDuplicatedCategory={false} stroke="#64748b" />
                                <YAxis stroke="#64748b" domain={['auto', 'auto']} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                                {paths.map((path) => (
                                    <Line 
                                        key={path.id} 
                                        data={path.values.map((v, i) => ({ index: i, value: v }))} 
                                        dataKey="value" 
                                        stroke={path.values[path.values.length-1] > 100 ? '#10b981' : '#ef4444'} 
                                        strokeWidth={1} 
                                        strokeOpacity={0.4} 
                                        dot={false} 
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                 )}
              </Card>
          </div>

          <div className="space-y-6">
              <Card title="Risk Metrics (VaR)">
                  <div className="space-y-4">
                      <div>
                          <div className="text-slate-500 text-xs uppercase">Value at Risk (95%)</div>
                          <div className="text-2xl font-bold text-red-400">-4.2%</div>
                          <div className="text-xs text-slate-500">Daily VaR estimate</div>
                      </div>
                      <div>
                          <div className="text-slate-500 text-xs uppercase">Conditional VaR (Expected Shortfall)</div>
                          <div className="text-2xl font-bold text-red-400">-6.8%</div>
                          <div className="text-xs text-slate-500">Average loss exceeding VaR</div>
                      </div>
                      <div className="pt-4 border-t border-slate-800">
                          <div className="flex justify-between items-center mb-1">
                              <span className="text-sm text-slate-300">Probability of Ruin</span>
                              <Badge variant="success">0.2%</Badge>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full w-[1%]"></div>
                          </div>
                      </div>
                  </div>
              </Card>
              
              <Card>
                  <div className="flex items-start space-x-3">
                      <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                      <div>
                          <h4 className="font-semibold text-slate-200 text-sm">Stress Test Scenario</h4>
                          <p className="text-xs text-slate-400 mt-1">
                              If volatility increases by 50% (VIX > 25), the expected drawdown increases to -18%.
                          </p>
                      </div>
                  </div>
              </Card>
          </div>
      </div>
    </div>
  );
};

export default RiskAnalysis;
