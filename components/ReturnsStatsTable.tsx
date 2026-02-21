import React from 'react';

interface ReturnsStatsTableProps {
    stats: any;
}

/**
 * Map metric keys to human categories for grouping.
 * Each entry is a tuple of [categoryName, patternRegex].
 */
const CATEGORY_PATTERNS: Array<[string, RegExp]> = [
    ['Performance', /Return|CAGR|Total|Annualized/i],
    ['Risk', /Volatility|Drawdown|Sharpe|Sortino|Calmar|Kelly|Omega|Tail|VaR|Beta|Alpha/i],
    ['Time', /Start|End|Period|Duration/i],
    ['Distribution', /Skew|Kurtosis/i],
    // leave benchmark out of categories; will treat specially
];

const determineCategory = (key: string) => {
    for (const [cat, rx] of CATEGORY_PATTERNS) {
        if (rx.test(key)) return cat;
    }
    return 'Other';
};

const formatValue = (key: string, raw: any): string => {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'number' && !isNaN(raw)) {
        // add percent sign for keys containing "%" or "Return" etc.
        const rounded = raw.toFixed(2);
        if (/%$/.test(key) || /Return/i.test(key) || /Ratio/i.test(key)) {
            return `${rounded}`;
        }
        return rounded;
    }
    // dates/timestamps
    if (typeof raw === 'string' && /\d{4}-\d{2}-\d{2}/.test(raw)) {
        return raw;
    }
    try {
        return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    } catch {
        return String(raw);
    }
};

const ReturnsStatsTable: React.FC<ReturnsStatsTableProps> = ({ stats }) => {
    if (!stats || typeof stats !== 'object') {
        return <div className="text-slate-500 italic">No detailed stats available.</div>;
    }

    // build grouped rows
    const groups: Record<string, Array<{ key: string; value: string }>> = {};
    Object.entries(stats).forEach(([k, v]) => {
        // remap benchmark return key for clarity
        let key = k;
        if (/Benchmark Return/i.test(k)) {
            key = 'Underlying Return [%]';
        }
        const cat = determineCategory(key);
        const display = formatValue(key, v);
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({ key, value: display });
    });

    const sortedCategories = Object.keys(groups).sort();

    if (sortedCategories.length === 0) {
        return <div className="text-slate-500 italic">No detailed stats available.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-400">
                <thead className="bg-slate-950 text-xs uppercase sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Metric</th>
                        <th className="px-4 py-2">Value</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {sortedCategories.map((cat) => (
                        <React.Fragment key={cat}>
                            <tr className="bg-slate-800">
                                <td colSpan={2} className="px-4 py-1 text-xs font-semibold text-slate-300 uppercase">
                                    {cat}
                                </td>
                            </tr>
                            {groups[cat].map((r) => (
                                <tr
                                    key={r.key}
                                    className="hover:bg-slate-800/80 transition-colors"
                                >
                                    <td className="px-4 py-2 font-mono align-top">{r.key}</td>
                                    <td className="px-4 py-2">{r.value}</td>
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ReturnsStatsTable;
