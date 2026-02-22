import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export type WizardStep = 'setup' | 'results' | 'risk';

interface WizardStepsProps {
    step: WizardStep;
}

const STEPS: { key: WizardStep; label: string }[] = [
    { key: 'setup',   label: 'Configure' },
    { key: 'results', label: 'Results'   },
    { key: 'risk',    label: 'Risk Tune' },
];

/**
 * Horizontal progress indicator for the Optimization wizard.
 * Shows: Configure → Results → Risk Tune
 * Only renders once results exist (otherwise only "Configure" is relevant).
 */
const WizardSteps: React.FC<WizardStepsProps> = ({ step }) => {
    const currentIdx = STEPS.findIndex(s => s.key === step);

    return (
        <div className="flex items-center gap-2">
            {STEPS.map((s, idx) => {
                const done = idx < currentIdx;
                const active = idx === currentIdx;
                return (
                    <React.Fragment key={s.key}>
                        {idx > 0 && (
                            <div className={`flex-1 h-px ${done ? 'bg-emerald-600/60' : 'bg-slate-700'}`} />
                        )}
                        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full transition-colors ${
                            done   ? 'text-emerald-400' :
                            active ? 'text-slate-100 bg-slate-700 border border-slate-600' :
                                     'text-slate-600'
                        }`}>
                            {done
                                ? <CheckCircle2 className="w-3.5 h-3.5" />
                                : <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] border ${active ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-700 text-slate-600'}`}>{idx + 1}</span>
                            }
                            {s.label}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default WizardSteps;
