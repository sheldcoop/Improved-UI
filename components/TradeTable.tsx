/**
 * TradeTable.tsx — Reusable trade log component.
 *
 * Features:
 *  - Sort by any column (click header, click again to flip, third click resets)
 *  - Filter by date range (entry date), result (WIN/LOSS), and side (LONG/SHORT)
 *  - Summary line showing filtered counts
 *  - Shows Exit Date column alongside Entry Date
 *  - onRowClick is optional — used by Results.tsx to zoom the equity chart
 */
import React, { useState, useMemo } from 'react';
import { Trade } from '../types';
import { Badge } from './ui/Badge';
import { DateInput } from './ui/DateInput';
import { formatDateDisplay } from '../utils/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'entryDate' | 'exitDate' | 'qty' | 'entryPrice' | 'exitPrice' | 'pnl' | 'pnlPct';
type SortDir = 'asc' | 'desc';

interface TradeTableProps {
  trades: Trade[];
  onRowClick?: (trade: Trade) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeToFixed = (val: number | null | undefined, decimals = 2): string => {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return val.toFixed(decimals);
};

/** Convert any date string to a yyyy-mm-dd string for comparison. */
const toDateStr = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
};

// ─── Sort icon ────────────────────────────────────────────────────────────────

const SortIcon: React.FC<{ col: SortKey; active: SortKey; dir: SortDir }> = ({ col, active, dir }) => {
  if (col !== active) {
    return <span className="ml-1 text-slate-600 text-[10px]">⇅</span>;
  }
  return (
    <span className="ml-1 text-emerald-400 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>
  );
};

// ─── Filter toggle button ─────────────────────────────────────────────────────

const FilterBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
      active
        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
    }`}
  >
    {children}
  </button>
);

// ─── Main component ───────────────────────────────────────────────────────────

const TradeTable: React.FC<TradeTableProps> = ({ trades, onRowClick }) => {
  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('entryDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Filter state
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');

  // ── Column sort handler ──────────────────────────────────────────────────
  const handleSort = (col: SortKey) => {
    if (sortKey !== col) {
      setSortKey(col);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      // third click: reset to default
      setSortKey('entryDate');
      setSortDir('asc');
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (filterResult !== 'ALL' && t.status !== filterResult) return false;
      if (filterSide !== 'ALL' && t.side !== filterSide) return false;
      if (filterFrom) {
        const tDate = toDateStr(t.entryDate);
        if (tDate < filterFrom) return false;
      }
      if (filterTo) {
        const tDate = toDateStr(t.entryDate);
        if (tDate > filterTo) return false;
      }
      return true;
    });
  }, [trades, filterFrom, filterTo, filterResult, filterSide]);

  // ── Sort ─────────────────────────────────────────────────────────────────
  const sortedTrades = useMemo(() => {
    const sorted = [...filteredTrades];
    sorted.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sortKey === 'entryDate') {
        aVal = a.entryDate ?? '';
        bVal = b.entryDate ?? '';
      } else if (sortKey === 'exitDate') {
        aVal = a.exitDate ?? '';
        bVal = b.exitDate ?? '';
      } else {
        aVal = (a as any)[sortKey] ?? 0;
        bVal = (b as any)[sortKey] ?? 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredTrades, sortKey, sortDir]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const wins = filteredTrades.filter((t) => t.status === 'WIN').length;
    const losses = filteredTrades.filter((t) => t.status === 'LOSS').length;
    return { total: filteredTrades.length, wins, losses };
  }, [filteredTrades]);

  const hasFilters = filterFrom || filterTo || filterResult !== 'ALL' || filterSide !== 'ALL';

  const clearFilters = () => {
    setFilterFrom('');
    setFilterTo('');
    setFilterResult('ALL');
    setFilterSide('ALL');
  };

  // ── Sortable header cell ──────────────────────────────────────────────────
  const SortTh: React.FC<{ col: SortKey; right?: boolean; children: React.ReactNode }> = ({
    col, right, children
  }) => (
    <th
      className={`px-4 py-3 cursor-pointer select-none group hover:text-slate-200 transition-colors whitespace-nowrap ${right ? 'text-right' : ''}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {!right && children}
        <SortIcon col={col} active={sortKey} dir={sortDir} />
        {right && children}
      </span>
    </th>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-end gap-3 px-1">
        {/* Date range */}
        <div className="flex items-end gap-2">
          <DateInput
            label="From"
            value={filterFrom}
            onChange={setFilterFrom}
            className="w-36"
          />
          <DateInput
            label="To"
            value={filterTo}
            onChange={setFilterTo}
            className="w-36"
          />
        </div>

        {/* Result filter */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Result</span>
          <div className="flex gap-1">
            <FilterBtn active={filterResult === 'ALL'} onClick={() => setFilterResult('ALL')}>All</FilterBtn>
            <FilterBtn active={filterResult === 'WIN'} onClick={() => setFilterResult('WIN')}>Wins</FilterBtn>
            <FilterBtn active={filterResult === 'LOSS'} onClick={() => setFilterResult('LOSS')}>Losses</FilterBtn>
          </div>
        </div>

        {/* Side filter */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Side</span>
          <div className="flex gap-1">
            <FilterBtn active={filterSide === 'ALL'} onClick={() => setFilterSide('ALL')}>All</FilterBtn>
            <FilterBtn active={filterSide === 'LONG'} onClick={() => setFilterSide('LONG')}>Long</FilterBtn>
            <FilterBtn active={filterSide === 'SHORT'} onClick={() => setFilterSide('SHORT')}>Short</FilterBtn>
          </div>
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors underline underline-offset-2 self-end pb-1"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Summary line ── */}
      <div className="flex items-center gap-3 px-1 text-xs text-slate-500">
        <span>
          Showing <span className="text-slate-300 font-semibold">{stats.total}</span> of{' '}
          <span className="text-slate-300 font-semibold">{trades.length}</span> trades
        </span>
        <span className="text-slate-700">·</span>
        <span className="text-emerald-500 font-medium">{stats.wins} wins</span>
        <span className="text-slate-700">·</span>
        <span className="text-red-400 font-medium">{stats.losses} losses</span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto max-h-[500px] rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="bg-slate-950 text-xs uppercase sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <SortTh col="entryDate">Entry Date</SortTh>
              <SortTh col="exitDate">Exit Date</SortTh>
              {/* Side is not sortable numerically, keep it plain */}
              <th className="px-4 py-3 whitespace-nowrap">Side</th>
              <SortTh col="qty" right>Qty</SortTh>
              <SortTh col="entryPrice" right>Entry Price</SortTh>
              <SortTh col="exitPrice" right>Exit Price</SortTh>
              <SortTh col="pnl" right>PnL</SortTh>
              <SortTh col="pnlPct" right>Return %</SortTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {hasFilters
                    ? 'No trades match the current filters.'
                    : 'No trades recorded in this simulation.'}
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade) => (
                <tr
                  key={trade.id}
                  className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-slate-800/70' : ''}`}
                  onClick={() => onRowClick?.(trade)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateDisplay(trade.entryDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateDisplay(trade.exitDate)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={trade.side === 'LONG' ? 'success' : 'danger'}>
                      {trade.side}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">
                    {trade.qty != null ? trade.qty.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{safeToFixed(trade.entryPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono">{safeToFixed(trade.exitPrice)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trade.pnl >= 0 ? '+' : ''}{safeToFixed(trade.pnl)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trade.pnlPct >= 0 ? '+' : ''}{safeToFixed(trade.pnlPct)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeTable;
