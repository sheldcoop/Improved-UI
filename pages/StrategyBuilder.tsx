
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Save, PlayCircle, Filter, Code, Cpu, GitBranch, Clock, Zap, MessageSquare, ChevronDown, ChevronRight, Activity } from 'lucide-react';
import { AssetClass, Timeframe, IndicatorType, Operator, Strategy, Logic, RuleGroup, Condition, PositionSizeMode, RankingMethod } from '../types';
import { saveStrategy, runBacktest } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

// --- INITIAL STATE ---
const INITIAL_GROUP: RuleGroup = {
    id: 'root_entry',
    type: 'GROUP',
    logic: Logic.AND,
    conditions: [
        { 
            id: 'init_1', 
            indicator: IndicatorType.RSI, 
            period: 14, 
            operator: Operator.LESS_THAN, 
            compareType: 'STATIC', 
            value: 30 
        }
    ]
};

const StrategyBuilder: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'VISUAL' | 'CODE'>('VISUAL');
  
  // Strategy State
  const [strategy, setStrategy] = useState<Strategy>({
    id: 'new',
    name: 'Untitled Strategy',
    description: '',
    assetClass: AssetClass.EQUITY,
    timeframe: Timeframe.D1,
    mode: 'VISUAL',
    entryLogic: INITIAL_GROUP,
    exitLogic: { ...INITIAL_GROUP, id: 'root_exit', conditions: [] },
    pythonCode: "def signal_logic(df):\n    # Write custom logic here\n    # Returns: entries (bool series), exits (bool series)\n    sma = vbt.MA.run(df['Close'], 20)\n    entries = df['Close'] > sma.ma\n    exits = df['Close'] < sma.ma\n    return entries, exits",
    stopLossPct: 2.0,
    takeProfitPct: 5.0,
    useTrailingStop: false,
    pyramiding: 1,
    positionSizing: PositionSizeMode.FIXED_CAPITAL,
    positionSizeValue: 100000,
    rankingMethod: RankingMethod.NONE,
    rankingTopN: 5,
    startTime: '09:15',
    endTime: '15:30',
    created: new Date().toISOString()
  });

  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  // --- HELPERS ---
  const generateSummary = useMemo(() => {
     if(strategy.mode === 'CODE') return "Custom Python Logic Strategy";
     
     const describeGroup = (group: RuleGroup): string => {
         if(!group.conditions.length) return "No conditions";
         return group.conditions.map(c => {
             if('type' in c && c.type === 'GROUP') return `(${describeGroup(c as RuleGroup)})`;
             const cond = c as Condition;
             const right = cond.compareType === 'STATIC' ? cond.value : `${cond.rightIndicator}(${cond.rightPeriod})`;
             const tf = cond.timeframe ? `[${cond.timeframe}]` : '';
             return `${cond.indicator}${tf}(${cond.period}) ${cond.operator} ${right}`;
         }).join(` ${group.logic} `);
     };

     return `Entry when ${describeGroup(strategy.entryLogic)}. Exit when ${describeGroup(strategy.exitLogic)}.`;
  }, [strategy]);

  // --- ACTIONS ---
  const handleAiGenerate = () => {
      if(!aiPrompt) return;
      setIsAiLoading(true);
      // MOCK AI GENERATION
      setTimeout(() => {
          setStrategy(prev => ({
              ...prev,
              name: "AI: Trend Follower",
              entryLogic: {
                  id: 'ai_root',
                  type: 'GROUP',
                  logic: Logic.AND,
                  conditions: [
                      { id: 'ai_1', indicator: IndicatorType.CLOSE, period: 1, operator: Operator.GREATER_THAN, compareType: 'INDICATOR', rightIndicator: IndicatorType.SMA, rightPeriod: 200, value: 0 },
                      { id: 'ai_2', indicator: IndicatorType.RSI, period: 14, operator: Operator.LESS_THAN, compareType: 'STATIC', value: 70 }
                  ]
              }
          }));
          setIsAiLoading(false);
          setAiPrompt('');
      }, 1500);
  };

  const handleRun = async () => {
      setRunning(true);
      try {
        // Flatten payload for backend
        const result = await runBacktest(null, 'NIFTY 50', {
            ...strategy,
            capital: strategy.positionSizeValue,
            strategyName: strategy.name
        });
        navigate('/results', { state: { result } });
      } catch (e) {
          alert("Error: " + e);
      } finally {
          setRunning(false);
      }
  };

  // --- RENDERERS ---

  // Recursive Group Renderer
  const GroupRenderer: React.FC<{ group: RuleGroup, onChange: (g: RuleGroup) => void, depth?: number }> = ({ group, onChange, depth = 0 }) => {
      
      const addCondition = () => {
          const newCond: Condition = { id: Date.now().toString(), indicator: IndicatorType.RSI, period: 14, operator: Operator.GREATER_THAN, compareType: 'STATIC', value: 50 };
          onChange({ ...group, conditions: [...group.conditions, newCond] });
      };

      const addGroup = () => {
           const newGroup: RuleGroup = { id: Date.now().toString() + '_g', type: 'GROUP', logic: Logic.OR, conditions: [] };
           onChange({ ...group, conditions: [...group.conditions, newGroup] });
      };

      const removeChild = (idx: number) => {
          const newConds = [...group.conditions];
          newConds.splice(idx, 1);
          onChange({ ...group, conditions: newConds });
      };

      const updateChild = (idx: number, newVal: Condition | RuleGroup) => {
          const newConds = [...group.conditions];
          newConds[idx] = newVal;
          onChange({ ...group, conditions: newConds });
      };

      return (
          <div className={`p-4 rounded-xl border ${depth === 0 ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-slate-700 ml-6 mt-2 relative'}`}>
              {depth > 0 && <div className="absolute -left-6 top-6 w-6 h-[1px] bg-slate-700"></div>}
              
              <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                      {depth > 0 && <span className="text-xs text-slate-500 font-mono">GROUP</span>}
                      <div className="flex bg-slate-800 rounded p-1">
                          <button onClick={() => onChange({...group, logic: Logic.AND})} className={`px-3 py-1 text-xs rounded ${group.logic === Logic.AND ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>AND</button>
                          <button onClick={() => onChange({...group, logic: Logic.OR})} className={`px-3 py-1 text-xs rounded ${group.logic === Logic.OR ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>OR</button>
                      </div>
                  </div>
                  <div className="flex space-x-2">
                      <button onClick={addCondition} className="text-xs text-emerald-400 hover:bg-emerald-900/30 px-2 py-1 rounded flex items-center"><Plus className="w-3 h-3 mr-1"/> Rule</button>
                      <button onClick={addGroup} className="text-xs text-indigo-400 hover:bg-indigo-900/30 px-2 py-1 rounded flex items-center"><GitBranch className="w-3 h-3 mr-1"/> Group</button>
                  </div>
              </div>

              <div className="space-y-3">
                  {group.conditions.map((child, idx) => (
                      <div key={child.id} className="relative">
                          {'type' in child && child.type === 'GROUP' ? (
                              <div className="flex items-start">
                                  <div className="flex-1">
                                    <GroupRenderer group={child as RuleGroup} onChange={(g) => updateChild(idx, g)} depth={depth + 1} />
                                  </div>
                                  <button onClick={() => removeChild(idx)} className="ml-2 mt-6 text-slate-600 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
                              </div>
                          ) : (
                              <RuleRow condition={child as Condition} onChange={(c) => updateChild(idx, c)} onRemove={() => removeChild(idx)} />
                          )}
                          {idx < group.conditions.length - 1 && (
                              <div className="flex justify-center my-1">
                                  <div className="h-4 w-[1px] bg-slate-800"></div>
                              </div>
                          )}
                      </div>
                  ))}
                  {group.conditions.length === 0 && (
                      <div className="text-center py-4 text-xs text-slate-600 border border-dashed border-slate-800 rounded">
                          No conditions yet. Add a rule to start.
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const RuleRow: React.FC<{ condition: Condition, onChange: (c: Condition) => void, onRemove: () => void }> = ({ condition, onChange, onRemove }) => (
      <div className="flex items-center space-x-2 bg-slate-950 p-2 rounded border border-slate-800 hover:border-slate-600 transition-colors">
          {/* LEFT SIDE */}
          <div className="flex items-center space-x-1">
            {/* Multi-Timeframe Selector */}
            <select
                value={condition.timeframe || ''}
                onChange={(e) => onChange({...condition, timeframe: e.target.value ? e.target.value as Timeframe : undefined})}
                className="bg-slate-900 border border-slate-700 text-purple-300 text-[10px] rounded px-1 py-1 w-14 outline-none mr-1"
                title="Timeframe Override"
            >
                <option value="">Curr</option>
                {Object.values(Timeframe).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select 
                value={condition.indicator} 
                onChange={(e) => onChange({...condition, indicator: e.target.value as IndicatorType})}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-28 outline-none"
            >
                {Object.values(IndicatorType).map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input 
                type="number" 
                value={condition.period} 
                onChange={(e) => onChange({...condition, period: parseInt(e.target.value)})}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-1 py-1 w-12 text-center"
                placeholder="14"
            />
          </div>

          {/* OPERATOR */}
          <select 
             value={condition.operator}
             onChange={(e) => onChange({...condition, operator: e.target.value as Operator})}
             className="bg-slate-900 border border-slate-700 text-emerald-400 font-bold text-xs rounded px-2 py-1 outline-none"
          >
              {Object.values(Operator).map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          {/* RIGHT SIDE */}
          <div className="flex items-center space-x-1 flex-1">
             <button 
                onClick={() => onChange({...condition, compareType: condition.compareType === 'STATIC' ? 'INDICATOR' : 'STATIC'})}
                className={`text-[10px] px-1 py-1 rounded border ${condition.compareType === 'STATIC' ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-purple-900/30 border-purple-500 text-purple-400'}`}
             >
                 {condition.compareType === 'STATIC' ? '123' : 'IND'}
             </button>

             {condition.compareType === 'STATIC' ? (
                 <input 
                    type="number" 
                    value={condition.value}
                    onChange={(e) => onChange({...condition, value: parseFloat(e.target.value)})}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-24"
                 />
             ) : (
                 <>
                    {/* MTF for Right Side */}
                    <select
                        value={condition.rightTimeframe || ''}
                        onChange={(e) => onChange({...condition, rightTimeframe: e.target.value ? e.target.value as Timeframe : undefined})}
                        className="bg-slate-900 border border-slate-700 text-purple-300 text-[10px] rounded px-1 py-1 w-14 outline-none mr-1"
                    >
                        <option value="">Curr</option>
                        {Object.values(Timeframe).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select 
                        value={condition.rightIndicator} 
                        onChange={(e) => onChange({...condition, rightIndicator: e.target.value as IndicatorType})}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 w-28 outline-none"
                    >
                        {Object.values(IndicatorType).map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                    <input 
                        type="number" 
                        value={condition.rightPeriod || 14} 
                        onChange={(e) => onChange({...condition, rightPeriod: parseInt(e.target.value)})}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-1 py-1 w-12 text-center"
                    />
                 </>
             )}
          </div>

          <button onClick={onRemove} className="text-slate-600 hover:text-red-400 p-1"><Trash2 className="w-3 h-3"/></button>
      </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-8rem)]">
      
      {/* LEFT: Config Panel (3 Cols) */}
      <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-2">
         <Card className="p-4 space-y-4">
             <div>
                 <label className="text-xs text-slate-500 block mb-1">Strategy Name</label>
                 <input type="text" value={strategy.name} onChange={e => setStrategy({...strategy, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none" />
             </div>
             
             <div className="grid grid-cols-2 gap-2">
                 <div>
                    <label className="text-xs text-slate-500 block mb-1">Asset Class</label>
                    <select value={strategy.assetClass} onChange={e => setStrategy({...strategy, assetClass: e.target.value as any})} className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200">
                        {Object.values(AssetClass).map(a => <option key={a}>{a}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-xs text-slate-500 block mb-1">Timeframe</label>
                    <select value={strategy.timeframe} onChange={e => setStrategy({...strategy, timeframe: e.target.value as any})} className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200">
                        {Object.values(Timeframe).map(t => <option key={t}>{t}</option>)}
                    </select>
                 </div>
             </div>

             <div className="border-t border-slate-800 pt-3">
                 <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Risk Management</h4>
                 <div className="grid grid-cols-2 gap-2 mb-2">
                     <div>
                        <label className="text-[10px] text-slate-500 block">Stop Loss %</label>
                        <input type="number" value={strategy.stopLossPct} onChange={e => setStrategy({...strategy, stopLossPct: parseFloat(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                     </div>
                     <div>
                        <label className="text-[10px] text-slate-500 block">Take Profit %</label>
                        <input type="number" value={strategy.takeProfitPct} onChange={e => setStrategy({...strategy, takeProfitPct: parseFloat(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                     </div>
                 </div>
                 <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
                     <input type="checkbox" checked={strategy.useTrailingStop} onChange={e => setStrategy({...strategy, useTrailingStop: e.target.checked})} className="rounded bg-slate-800 border-slate-600" />
                     <span>Trailing Stop Loss</span>
                 </label>
             </div>

             <div className="border-t border-slate-800 pt-3">
                 <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Execution</h4>
                 <div className="space-y-2">
                     <div>
                        <label className="text-[10px] text-slate-500 block">Position Sizing</label>
                        <select value={strategy.positionSizing} onChange={e => setStrategy({...strategy, positionSizing: e.target.value as any})} className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1 text-slate-200 mb-1">
                            {Object.values(PositionSizeMode).map(m => <option key={m}>{m}</option>)}
                        </select>
                        <input type="number" value={strategy.positionSizeValue} onChange={e => setStrategy({...strategy, positionSizeValue: parseFloat(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 block">Start Time</label>
                            <input type="time" value={strategy.startTime} onChange={e => setStrategy({...strategy, startTime: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 block">End Time</label>
                            <input type="time" value={strategy.endTime} onChange={e => setStrategy({...strategy, endTime: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                        </div>
                     </div>
                     <div>
                         <label className="text-[10px] text-slate-500 block">Pyramiding (Max Entries)</label>
                         <input type="number" max={10} value={strategy.pyramiding} onChange={e => setStrategy({...strategy, pyramiding: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                     </div>
                 </div>
             </div>
         </Card>

         <div className="mt-auto">
             <Button onClick={handleRun} disabled={running} className="w-full py-3 mb-2 shadow-emerald-900/40" icon={running ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <PlayCircle className="w-5 h-5"/>}>
                 {running ? 'Simulating...' : 'Run Strategy'}
             </Button>
         </div>
      </div>

      {/* MIDDLE: Builder Area (6 Cols) */}
      <div className="lg:col-span-6 flex flex-col gap-4 overflow-hidden">
         {/* AI Prompt Bar */}
         <div className="bg-slate-900 border border-slate-800 p-1 rounded-lg flex items-center shadow-sm">
             <div className="p-2 text-purple-400"><Cpu className="w-5 h-5" /></div>
             <input 
                type="text" 
                placeholder="Ask AI: 'Create a strategy buying RSI dip below 30 in an uptrend (SMA 200)'" 
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                className="flex-1 bg-transparent border-none text-sm text-slate-200 focus:ring-0 placeholder:text-slate-600"
                onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
             />
             <button onClick={handleAiGenerate} disabled={isAiLoading || !aiPrompt} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded m-1 transition-colors disabled:opacity-50">
                 {isAiLoading ? 'Thinking...' : 'Generate'}
             </button>
         </div>

         {/* Mode Switcher */}
         <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit">
             <button onClick={() => { setActiveTab('VISUAL'); setStrategy({...strategy, mode: 'VISUAL'}) }} className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'VISUAL' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}>
                 <Filter className="w-3 h-3 mr-2" /> Visual Builder
             </button>
             <button onClick={() => { setActiveTab('CODE'); setStrategy({...strategy, mode: 'CODE'}) }} className={`flex items-center px-3 py-1.5 text-xs font-medium rounded ${activeTab === 'CODE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white'}`}>
                 <Code className="w-3 h-3 mr-2" /> Python Code
             </button>
         </div>

         {/* MAIN EDITOR CANVAS */}
         <div className="flex-1 overflow-y-auto pr-2 space-y-6">
             {activeTab === 'VISUAL' ? (
                 <>
                    {/* Entry Logic */}
                    <div className="space-y-2">
                        <div className="flex items-center text-emerald-400 font-bold text-sm">
                            <Zap className="w-4 h-4 mr-2" /> ENTRY CONDITIONS
                        </div>
                        <GroupRenderer group={strategy.entryLogic} onChange={g => setStrategy({...strategy, entryLogic: g})} />
                    </div>

                    {/* Exit Logic */}
                    <div className="space-y-2">
                        <div className="flex items-center text-red-400 font-bold text-sm">
                            <Activity className="w-4 h-4 mr-2" /> EXIT CONDITIONS
                        </div>
                        <GroupRenderer group={strategy.exitLogic} onChange={g => setStrategy({...strategy, exitLogic: g})} />
                    </div>
                 </>
             ) : (
                 <div className="h-full flex flex-col">
                     <div className="bg-slate-950 border border-slate-800 rounded-t-lg p-2 flex items-center justify-between text-xs text-slate-500">
                         <span>strategy.py</span>
                         <span className="text-emerald-500">Python 3.10 Runtime</span>
                     </div>
                     <textarea 
                        value={strategy.pythonCode} 
                        onChange={e => setStrategy({...strategy, pythonCode: e.target.value})}
                        className="flex-1 bg-[#0d1117] text-slate-300 font-mono text-sm p-4 outline-none resize-none border border-slate-800 border-t-0 rounded-b-lg leading-relaxed"
                        spellCheck={false}
                     />
                 </div>
             )}
         </div>
         
         {/* Natural Language Summary */}
         <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-start space-x-3">
             <MessageSquare className="w-5 h-5 text-slate-500 mt-0.5" />
             <div>
                 <div className="text-xs font-bold text-slate-500 uppercase">Logic Summary</div>
                 <p className="text-sm text-slate-300 leading-snug">{generateSummary}</p>
             </div>
         </div>
      </div>

      {/* RIGHT: Realtime Preview (3 Cols) */}
      <div className="lg:col-span-3 flex flex-col gap-4">
          <Card title="Live Signal Preview" className="h-[300px] flex flex-col">
              <div className="flex-1 flex items-center justify-center bg-slate-950 m-[-1rem] mt-0 rounded-b-xl relative overflow-hidden">
                  {/* Mock Chart Visualization */}
                  <div className="absolute inset-0 opacity-30">
                      <svg width="100%" height="100%" viewBox="0 0 300 150" preserveAspectRatio="none">
                           <path d="M0,100 Q50,50 100,80 T200,60 T300,90" fill="none" stroke="#10b981" strokeWidth="2" />
                           <path d="M0,120 Q50,70 100,100 T200,80 T300,110" fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4" />
                      </svg>
                  </div>
                  <div className="z-10 text-center">
                      <div className="text-2xl font-bold text-slate-200">14</div>
                      <div className="text-xs text-slate-500">Signals on last 100 bars</div>
                      <div className="mt-2 flex justify-center space-x-2">
                          <Badge variant="success">8 Buys</Badge>
                          <Badge variant="danger">6 Sells</Badge>
                      </div>
                  </div>
              </div>
          </Card>
          
          <Card title="Universe Selection">
              <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-sm text-slate-300">NIFTY 50</span>
                      <input type="checkbox" checked readOnly className="rounded bg-emerald-600 border-none" />
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800 opacity-50">
                      <span className="text-sm text-slate-300">BANKNIFTY</span>
                      <input type="checkbox" className="rounded bg-slate-800 border-slate-600" />
                  </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800">
                   <div className="text-xs font-bold text-slate-500 uppercase mb-2">Screening Logic</div>
                   <select 
                        value={strategy.rankingMethod || RankingMethod.NONE}
                        onChange={(e) => setStrategy({...strategy, rankingMethod: e.target.value as RankingMethod})}
                        className="w-full bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-slate-200 outline-none"
                   >
                       {Object.values(RankingMethod).map(m => <option key={m} value={m}>{m}</option>)}
                   </select>
                   <div className="mt-2 flex items-center space-x-2">
                       <label className="text-xs text-slate-500">Select Top</label>
                       <input 
                            type="number" 
                            value={strategy.rankingTopN || 5}
                            onChange={(e) => setStrategy({...strategy, rankingTopN: parseInt(e.target.value)})}
                            className="w-12 bg-slate-950 border border-slate-700 rounded text-xs px-2 py-1 text-slate-200 text-center"
                       />
                       <span className="text-xs text-slate-500">Assets</span>
                   </div>
              </div>
          </Card>
      </div>

    </div>
  );
};

export default StrategyBuilder;
