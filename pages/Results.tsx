
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceArea } from 'recharts';
import { BacktestResult, Trade } from '../types';
import { AlertTriangle, List, Activity, BarChart as BarChartIcon, ArrowLeft, ZoomOut, Split } from 'lucide-react';
import { MONTH_NAMES } from '../constants';
import { CONFIG } from '../config';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

// Reusable Metric Box
const MetricBox: React.FC<{ label: string; value: string; subValue?: string; good?: boolean; icon?: React.ReactNode }> = ({ label, value, subValue, good, icon }) => (
  <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg hover:border-slate-700 transition-colors">
    <div className="flex justify-between items-start mb-1">
      <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold">{label}</div>
      {icon && <div className="text-slate-500 opacity-70">{icon}</div>}
    </div>
    <div className={`text-2xl font-bold ${good === undefined ? 'text-slate-100' : good ? CONFIG.COLORS.PROFIT : CONFIG.COLORS.LOSS}`}>
      {value}
    </div>
    {subValue && <div className="text-slate-500 text-xs mt-1">{subValue}</div>}
  </div>
);

const TradeTable: React.FC<{ trades: Trade[], onRowClick: (trade: Trade) => void }> = ({ trades, onRowClick }) => (
  <div className="overflow-x-auto max-h-[400px]">
    <table className="w-full text-left text-sm text-slate-400">
      <thead className="bg-slate-950 text-xs uppercase sticky top-0 z-10">
        <tr>
          <th className="px-4 py-3">Entry</th>
          <th className="px-4 py-3">Side</th>
          <th className="px-4 py-3 text-right">Entry Price</th>
          <th className="px-4 py-3 text-right">Exit Price</th>
          <th className="px-4 py-3 text-right">PnL</th>
          <th className="px-4 py-3 text-right">Return %</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {trades.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No trades recorded in this simulation.</td>
          </tr>
        ) : trades.map((trade) => (
          <tr
            key={trade.id}
            className="hover:bg-slate-800/80 cursor-pointer transition-colors"
            onClick={() => onRowClick(trade)}
          >
            <td className="px-4 py-3">{trade.entryDate}</td>
            <td className="px-4 py-3">
              <Badge variant={trade.side === 'LONG' ? 'success' : 'danger'}>{trade.side}</Badge>
            </td>
            <td className="px-4 py-3 text-right">{trade.entryPrice.toFixed(2)}</td>
            <td className="px-4 py-3 text-right">{trade.exitPrice.toFixed(2)}</td>
            <td className={`px-4 py-3 text-right font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {trade.pnl.toFixed(2)}
            </td>
            <td className={`px-4 py-3 text-right ${trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {trade.pnlPct.toFixed(2)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Results: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'TRADES' | 'DISTRIBUTION'>('OVERVIEW');
  const [distributionData, setDistributionData] = useState<any[]>([]);

  // Zoom State
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);

  // Safely load data on mount
  useEffect(() => {
    if (location.state?.result) {
      const res = location.state.result as BacktestResult;
      setResult(res);

      // Calculate Distribution
      if (res.trades && res.trades.length > 0) {
        const dist = res.trades.reduce((acc: any[], trade) => {
          const bucket = Math.floor(trade.pnlPct);
          const existing = acc.find(a => a.range === bucket);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ range: bucket, count: 1 });
          }
          return acc;
        }, []).sort((a: any, b: any) => a.range - b.range);
        setDistributionData(dist);
      }
    } else {
      navigate('/backtest');
    }
  }, [location, navigate]);

  const handleTradeClick = (trade: Trade) => {
    const entryIdx = result?.equityCurve.findIndex(c => c.date === trade.entryDate) || 0;
    const exitIdx = result?.equityCurve.findIndex(c => c.date === trade.exitDate) || 0;

    const padding = 5;
    const startIdx = Math.max(0, entryIdx - padding);
    const endIdx = Math.min(result?.equityCurve.length || 0, exitIdx + padding);

    if (result?.equityCurve[startIdx] && result?.equityCurve[endIdx]) {
      setZoomLeft(result.equityCurve[startIdx].date);
      setZoomRight(result.equityCurve[endIdx].date);
      setActiveTab('OVERVIEW');
    }
  };

  const resetZoom = () => {
    setZoomLeft(null);
    setZoomRight(null);
  };

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-500">Loading analysis...</div>
      </div>
    );
  }

  if (result.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="bg-red-500/10 p-4 rounded-full border border-red-500/20">
          <AlertTriangle className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Backtest Failed</h2>
        <p className="text-slate-400 max-w-md text-center">
          The simulation could not be completed. This is usually due to insufficient historical data.
        </p>
        <Button onClick={() => navigate('/backtest')} variant="primary" icon={<ArrowLeft className="w-4 h-4" />}>
          Adjust Configuration
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/backtest')} className="flex items-center text-sm text-slate-500 hover:text-white mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Config
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-100">{result.strategyName}</h2>
            {result.isDynamic && (
              <Badge variant="info" className="animate-pulse bg-indigo-500/20 text-indigo-400 border-indigo-500/30">
                <Split className="w-3 h-3 mr-1" /> Dynamic WFO
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-500 mt-1">
            <span className="bg-slate-800 px-2 py-0.5 rounded text-xs text-emerald-400 border border-emerald-500/20">{result.symbol}</span>
            <span>•</span>
            <span>{result.timeframe}</span>
            <span>•</span>
            <span>{result.startDate} to {result.endDate}</span>
          </div>
        </div>
        <div className="flex space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <Button variant={activeTab === 'OVERVIEW' ? 'primary' : 'ghost'} size="sm" onClick={() => setActiveTab('OVERVIEW')} icon={<Activity className="w-4 h-4" />}>Overview</Button>
          <Button variant={activeTab === 'TRADES' ? 'primary' : 'ghost'} size="sm" onClick={() => setActiveTab('TRADES')} icon={<List className="w-4 h-4" />}>Trades</Button>
          <Button variant={activeTab === 'DISTRIBUTION' ? 'primary' : 'ghost'} size="sm" onClick={() => setActiveTab('DISTRIBUTION')} icon={<BarChartIcon className="w-4 h-4" />}>Distribution</Button>
        </div>
      </div>

      {activeTab === 'OVERVIEW' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricBox label="Total Return" value={`${result.metrics?.totalReturnPct?.toFixed(1) || 0}%`} good={(result.metrics?.totalReturnPct ?? 0) > 0} />
            <MetricBox label="Sharpe" value={result.metrics?.sharpeRatio?.toFixed(2) || '0.00'} good={(result.metrics?.sharpeRatio ?? 0) > 1.5} />
            <MetricBox label="Max Drawdown" value={`-${result.metrics?.maxDrawdownPct?.toFixed(1) || 0}%`} good={(result.metrics?.maxDrawdownPct ?? 0) < 20} icon={<AlertTriangle className="w-4 h-4" />} />
            <MetricBox label="Calmar" value={result.metrics?.calmarRatio?.toFixed(2) || '0.00'} good={(result.metrics?.calmarRatio ?? 0) > 2.0} />
            <MetricBox label="Win Rate" value={`${result.metrics?.winRate?.toFixed(1) || 0}%`} good={(result.metrics?.winRate ?? 0) > 50} />
            <MetricBox label="Expectancy" value={result.metrics?.expectancy?.toFixed(2) || '0.00'} good={(result.metrics?.expectancy ?? 0) > 0} />
            <MetricBox label="Profit Factor" value={result.metrics?.profitFactor?.toFixed(2) || '0.00'} />
            <MetricBox label="Kelly %" value={`${result.metrics?.kellyCriterion?.toFixed(1) || 0}%`} />
            <MetricBox label="Total Trades" value={result.metrics?.totalTrades?.toString() || '0'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card
              title="Equity Curve & Drawdown"
              className="lg:col-span-2 h-[450px] flex flex-col"
              action={zoomLeft && <Button size="sm" variant="secondary" onClick={resetZoom} icon={<ZoomOut className="w-3 h-3" />}>Reset Zoom</Button>}
            >
              {result.equityCurve && result.equityCurve.length > 0 ? (
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.equityCurve}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CONFIG.COLORS.PROFIT} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CONFIG.COLORS.PROFIT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CONFIG.COLORS.GRID} vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke={CONFIG.COLORS.TEXT}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={30}
                        domain={zoomLeft && zoomRight ? [zoomLeft, zoomRight] : ['auto', 'auto']}
                        allowDataOverflow
                      />
                      <YAxis yAxisId="left" stroke={CONFIG.COLORS.TEXT} fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                      <Area yAxisId="left" type="monotone" dataKey="value" name="Equity" stroke={CONFIG.COLORS.PROFIT} strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" animationDuration={500} />
                      {zoomLeft && zoomRight && (
                        <ReferenceArea
                          x1={zoomLeft}
                          x2={zoomRight}
                          yAxisId="left"
                          {...({ fill: CONFIG.COLORS.PROFIT, fillOpacity: 0.1 } as any)}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-600 italic">No equity data available.</div>
              )}
            </Card>

            {result.isDynamic && result.paramHistory && (
              <Card title="WFO Parameter History" className="h-[450px] overflow-y-auto">
                <div className="space-y-3">
                  {result.paramHistory.map((h, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                      <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold mb-2">
                        <span>Window {i + 1}</span>
                        <span>{h.start} to {h.end}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(h.params).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs">
                            <span className="text-slate-400 capitalize">{k}</span>
                            <span className="text-emerald-400 font-mono">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card title="Monthly Returns" className="h-[450px] flex flex-col">
              <div className="grid grid-cols-4 gap-2 flex-1 content-start overflow-y-auto">
                {result.monthlyReturns?.map((m, idx) => {
                  let colorClass = "bg-slate-800 text-slate-500";
                  if (m.returnPct > 0) {
                    if (m.returnPct > 5) colorClass = "bg-emerald-500 text-white font-bold";
                    else if (m.returnPct > 2) colorClass = "bg-emerald-600/80 text-white";
                    else colorClass = "bg-emerald-900/60 text-emerald-200";
                  } else if (m.returnPct < 0) {
                    if (m.returnPct < -5) colorClass = "bg-red-500 text-white font-bold";
                    else if (m.returnPct < -2) colorClass = "bg-red-600/80 text-white";
                    else colorClass = "bg-red-900/60 text-red-200";
                  }
                  return (
                    <div key={idx} className={`rounded-md p-2 flex flex-col items-center justify-center text-xs ${colorClass}`}>
                      <span className="opacity-70 text-[10px] uppercase">{MONTH_NAMES[m.month]}</span>
                      <span>{m.returnPct > 0 ? '+' : ''}{m.returnPct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Recent Trades" action={<Button variant="ghost" size="sm" onClick={() => setActiveTab('TRADES')}>View All</Button>}>
              <TradeTable trades={result.trades.slice(0, 5)} onRowClick={handleTradeClick} />
            </Card>
          </div>
        </>
      )}

      {activeTab === 'TRADES' && (
        <Card title="Trade Log (Click to Zoom)">
          <TradeTable trades={result.trades || []} onRowClick={handleTradeClick} />
        </Card>
      )}

      {activeTab === 'DISTRIBUTION' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Return Distribution" className="h-[400px]">
            {distributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CONFIG.COLORS.GRID} vertical={false} />
                  <XAxis dataKey="range" stroke={CONFIG.COLORS.TEXT} label={{ value: 'Return %', position: 'bottom', fill: CONFIG.COLORS.TEXT }} />
                  <YAxis stroke={CONFIG.COLORS.TEXT} />
                  <Tooltip cursor={{ fill: CONFIG.COLORS.GRID }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                  <Bar dataKey="count" fill="#6366f1">
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.range >= 0 ? CONFIG.COLORS.PROFIT : CONFIG.COLORS.LOSS} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">Not enough data for distribution.</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default Results;
