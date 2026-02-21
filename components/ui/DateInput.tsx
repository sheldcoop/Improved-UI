import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateDisplay } from '../../utils/dateUtils';

interface DateInputProps {
    value: string; // Expected in yyyy-mm-dd format
    onChange: (date: string) => void;
    label?: string;
    className?: string;
    disabled?: boolean;
}

/**
 * A custom date input that displays the user's preferred dd-mm-yyyy format.
 * It uses a hidden native date input to trigger the browser's calendar picker
 * while showing the formatted text for a premium experience.
 */
export const DateInput: React.FC<DateInputProps> = ({ value, onChange, label, className = '', disabled = false }) => {
    const hiddenInputRef = useRef<HTMLInputElement>(null);

    const handleContainerClick = () => {
        if (disabled) return;
        if (hiddenInputRef.current) {
            // Use the newer showPicker() API if available, otherwise just click/focus
            if ('showPicker' in HTMLInputElement.prototype) {
                try {
                    hiddenInputRef.current.showPicker();
                } catch (e) {
                    hiddenInputRef.current.focus();
                }
            } else {
                hiddenInputRef.current.focus();
            }
        }
    };

    return (
        <div className={`relative flex flex-col ${className}`}>
            {label && <label className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">{label}</label>}

            <div
                onClick={handleContainerClick}
                className={`flex items-center justify-between border rounded-lg px-4 py-2.5 transition-colors group ${disabled
                        ? 'bg-slate-950 border-slate-800 cursor-not-allowed opacity-60'
                        : 'bg-slate-900 border-slate-800 cursor-pointer hover:border-slate-700'
                    }`}
            >
                <span className={`${disabled ? 'text-slate-500' : 'text-slate-100'} font-medium`}>
                    {value ? formatDateDisplay(value) : 'Select Date'}
                </span>
                <Calendar className={`w-5 h-5 transition-colors ${disabled ? 'text-slate-700' : 'text-slate-500 group-hover:text-emerald-400'
                    }`} />

                {/* Hidden native input for functionality */}
                <input
                    ref={hiddenInputRef}
                    type="date"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none"
                    aria-hidden="true"
                    tabIndex={-1}
                />
            </div>
        </div>
    );
};
