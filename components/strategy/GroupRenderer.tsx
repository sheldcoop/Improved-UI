
import React from 'react';
import { Plus, GitBranch, Trash2 } from 'lucide-react';
import { RuleGroup, Condition, Logic, IndicatorType, Operator } from '../../types';
import { RuleRow } from './RuleRow';

interface GroupRendererProps {
    group: RuleGroup;
    onChange: (g: RuleGroup) => void;
    depth?: number;
}

export const GroupRenderer: React.FC<GroupRendererProps> = ({ group, onChange, depth = 0 }) => {
    
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
