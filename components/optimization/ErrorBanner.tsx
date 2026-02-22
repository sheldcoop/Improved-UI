import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ErrorBannerProps {
    message: string | null;
    onDismiss: () => void;
}

/**
 * Inline dismissible error banner.
 * Replaces all alert() calls in Optimization.tsx.
 * Renders nothing when message is null.
 */
const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss }) => {
    if (!message) return null;
    return (
        <div className="flex items-start justify-between gap-3 bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3">
            <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-300">{message}</p>
            </div>
            <button
                onClick={onDismiss}
                className="text-red-400 hover:text-red-200 shrink-0"
                aria-label="Dismiss error"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

export default ErrorBanner;
