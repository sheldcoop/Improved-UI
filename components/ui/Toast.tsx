import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, X, Info } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastContextType {
    toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let _counter = 0;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
        const id = ++_counter;
        setToasts(prev => [...prev, { id, message, variant }]);
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const ICONS: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
    error:   <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    info:    <Info className="w-4 h-4 text-blue-400 shrink-0" />,
};

const BORDER: Record<ToastVariant, string> = {
    success: 'border-emerald-500/40',
    error:   'border-red-500/40',
    warning: 'border-amber-500/40',
    info:    'border-blue-500/40',
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 5000);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    return (
        <div
            className={`pointer-events-auto flex items-start gap-3 bg-slate-900 border ${BORDER[toast.variant]} rounded-lg px-4 py-3 shadow-lg shadow-black/40 animate-in slide-in-from-right-5 fade-in`}
        >
            {ICONS[toast.variant]}
            <span className="text-sm text-slate-200 flex-1 leading-snug">{toast.message}</span>
            <button
                onClick={() => onDismiss(toast.id)}
                className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};

export const useToast = (): ToastContextType => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within a ToastProvider');
    return ctx;
};
