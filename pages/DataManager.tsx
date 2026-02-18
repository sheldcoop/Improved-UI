import React from 'react';
import { MOCK_SYMBOLS } from '../constants';
import { Download, Database, CheckCircle, RefreshCw } from 'lucide-react';

const DataManager: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-100">Data Manager</h2>
           <p className="text-slate-400 text-sm">Manage local historical data cache and imports.</p>
        </div>
        <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors">
          <RefreshCw className="w-4 h-4" />
          <span>Sync Symbol List</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="bg-slate-950 text-slate-200 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4 font-semibold">Symbol</th>
              <th className="px-6 py-4 font-semibold">Exchange</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold">Last Updated</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {MOCK_SYMBOLS.map((s) => (
              <tr key={s.symbol} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-200">{s.symbol}</td>
                <td className="px-6 py-4">{s.exchange}</td>
                <td className="px-6 py-4">
                  {s.dataAvailable ? (
                    <span className="inline-flex items-center text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-xs border border-emerald-500/20">
                      <CheckCircle className="w-3 h-3 mr-1" /> Cached
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-slate-500 bg-slate-800 px-2 py-1 rounded text-xs border border-slate-700">
                      <Database className="w-3 h-3 mr-1" /> Missing
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-xs">{s.lastUpdated}</td>
                <td className="px-6 py-4 text-right">
                  <button className="text-emerald-500 hover:text-emerald-400 font-medium text-xs flex items-center justify-end ml-auto space-x-1">
                    <Download className="w-3 h-3" />
                    <span>{s.dataAvailable ? 'Update' : 'Download'}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataManager;
