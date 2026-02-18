
import React, { useState, useEffect } from 'react';
import { MOCK_SYMBOLS } from '../constants';
import {
   Download, Database, CheckCircle, RefreshCw, Search, Filter,
   FileText, Calendar, Clock, AlertTriangle, Upload, Trash2,
   MoreHorizontal, Layers, Activity, CheckSquare, Square
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

// Extended interface for local state to support new features
interface ExtendedMarketData {
   symbol: string;
   exchange: string;
   dataAvailable: boolean;
   lastUpdated: string;
   startDate: string; // New: Range Start
   timeframes: string[]; // New: ['1m', '5m', '1d']
   health: 'GOOD' | 'GAP_DETECTED' | 'MISSING' | 'CHECKING'; // New: Health Check
   size: string; // New: Storage size
}

const DataManager: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'EQUITY' | 'OPTIONS' | 'IMPORT'>('EQUITY');
   const [searchTerm, setSearchTerm] = useState('');
   const [filterMode, setFilterMode] = useState<'ALL' | 'MISSING' | 'GAPS'>('ALL');

   // Local State for enriched data
   const [marketData, setMarketData] = useState<ExtendedMarketData[]>([]);
   const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
   const [isScanning, setIsScanning] = useState(false);
   const [isLoading, setIsLoading] = useState(false);
   const [activeDownloads, setActiveDownloads] = useState<Set<string>>(new Set());

   // Fetch real cache status from backend
   const fetchCacheStatus = async () => {
      setIsLoading(true);
      try {
         // 1. Get real cache status
         const res = await fetch('/api/v1/market/cache-status');
         const cached: any[] = await res.json();

         // 2. Map cached items to ExtendedMarketData
         const cachedSymbols = new Set(cached.map(c => c.symbol));

         const enriched = MOCK_SYMBOLS.map(s => {
            const cacheInfo = cached.find(c => c.symbol === s.symbol);
            if (cacheInfo) {
               return {
                  ...s,
                  startDate: cacheInfo.startDate,
                  lastUpdated: cacheInfo.lastUpdated,
                  timeframes: [cacheInfo.timeframe],
                  health: cacheInfo.health,
                  size: cacheInfo.size,
                  dataAvailable: true
               };
            }
            return {
               ...s,
               startDate: '-',
               timeframes: [],
               health: 'MISSING',
               size: '0 KB',
               dataAvailable: false
            } as ExtendedMarketData;
         });

         setMarketData(enriched);
      } catch (e) {
         console.error("Failed to fetch cache status", e);
      } finally {
         setIsLoading(false);
      }
   };

   useEffect(() => {
      fetchCacheStatus();
   }, []);

   // --- ACTIONS ---

   const toggleSelection = (symbol: string) => {
      const newSet = new Set(selectedItems);
      if (newSet.has(symbol)) newSet.delete(symbol);
      else newSet.add(symbol);
      setSelectedItems(newSet);
   };

   const toggleSelectAll = () => {
      if (selectedItems.size === marketData.length) {
         setSelectedItems(new Set());
      } else {
         setSelectedItems(new Set(marketData.map(d => d.symbol)));
      }
   };

   const handleUpdateSelected = async () => {
      if (selectedItems.size === 0) return;
      const targets = Array.from(selectedItems);
      for (const symbol of targets) {
         await handleDownload(symbol);
      }
      setSelectedItems(new Set());
   };

   const handleDownload = async (symbol: string) => {
      setActiveDownloads(prev => new Set(prev).add(symbol));
      try {
         const res = await fetch('/api/v1/market/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, timeframe: '1d' })
         });
         if (res.ok) {
            await fetchCacheStatus(); // Refresh status
         } else {
            alert(`Failed to download ${symbol}`);
         }
      } catch (e) {
         console.error("Download error", e);
      } finally {
         setActiveDownloads(prev => {
            const next = new Set<string>(prev);
            next.delete(symbol);
            return next;
         });
      }
   };

   const runHealthCheck = async () => {
      setIsScanning(true);
      // In a real app, we might scan all or selected. Here we check selected or all.
      const targets = selectedItems.size > 0
         ? Array.from(selectedItems)
         : marketData.filter(d => d.dataAvailable).map(d => d.symbol);

      try {
         for (const symbol of targets) {
            // Update UI to show checking
            setMarketData(prev => prev.map(item => item.symbol === symbol ? { ...item, health: 'CHECKING' } : item));

            // We use the validate endpoint for a default range (last 1 year)
            const to_date = new Date().toISOString().split('T')[0];
            const from_date = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];

            const res = await fetch('/api/v1/market/validate', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ symbol, timeframe: '1d', from_date, to_date })
            });

            if (res.ok) {
               const report = await res.json();
               setMarketData(prev => prev.map(item =>
                  item.symbol === symbol
                     ? { ...item, health: report.status === 'GOOD' ? 'GOOD' : 'GAP_DETECTED' }
                     : item
               ));
            }
         }
      } catch (e) {
         console.error("Health check error", e);
      } finally {
         setIsScanning(false);
      }
   };

   // --- RENDER HELPERS ---

   const getHealthBadge = (status: string) => {
      switch (status) {
         case 'GOOD': return <Badge variant="success" className="flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Healthy</Badge>;
         case 'GAP_DETECTED': return <Badge variant="danger" className="flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Gaps Found</Badge>;
         case 'CHECKING': return <Badge variant="warning" className="animate-pulse">Scanning...</Badge>;
         default: return <Badge variant="neutral">No Data</Badge>;
      }
   };

   const filteredData = marketData.filter(item => {
      const matchesSearch = item.symbol.toLowerCase().includes(searchTerm.toLowerCase());
      if (filterMode === 'MISSING') return matchesSearch && !item.dataAvailable;
      if (filterMode === 'GAPS') return matchesSearch && item.health === 'GAP_DETECTED';
      return matchesSearch;
   });

   return (
      <div className="space-y-6">

         {/* HEADER & TABS */}
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <h2 className="text-2xl font-bold text-slate-100">Data Manager</h2>
               <p className="text-slate-400 text-sm">Manage historical data, import CSVs, and validate integrity.</p>
            </div>
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
               {['EQUITY', 'OPTIONS', 'IMPORT'].map((tab) => (
                  <button
                     key={tab}
                     onClick={() => setActiveTab(tab as any)}
                     className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                  >
                     {tab === 'EQUITY' && 'Equity & Spot'}
                     {tab === 'OPTIONS' && 'Options Chain'}
                     {tab === 'IMPORT' && 'Import CSV'}
                  </button>
               ))}
            </div>
         </div>

         {/* MAIN CONTENT AREA */}
         {activeTab === 'EQUITY' && (
            <div className="space-y-4">

               {/* TOOLBAR */}
               <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                  {/* Left: Search & Filter */}
                  <div className="flex items-center space-x-3 w-full md:w-auto">
                     <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                           type="text"
                           placeholder="Search symbols..."
                           value={searchTerm}
                           onChange={e => setSearchTerm(e.target.value)}
                           className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                     </div>
                     <div className="flex items-center space-x-1 bg-slate-950 border border-slate-700 rounded-lg p-1">
                        <button onClick={() => setFilterMode('ALL')} className={`p-1.5 rounded ${filterMode === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`} title="All">
                           <Layers className="w-4 h-4" />
                        </button>
                        <button onClick={() => setFilterMode('GAPS')} className={`p-1.5 rounded ${filterMode === 'GAPS' ? 'bg-red-900/50 text-red-400' : 'text-slate-500 hover:text-slate-300'}`} title="Show Gaps">
                           <AlertTriangle className="w-4 h-4" />
                        </button>
                     </div>
                  </div>

                  {/* Right: Bulk Actions */}
                  <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
                     {selectedItems.size > 0 && (
                        <span className="text-sm text-slate-400 mr-2">{selectedItems.size} selected</span>
                     )}

                     <Button
                        variant="secondary"
                        size="sm"
                        icon={<Activity className="w-4 h-4" />}
                        onClick={runHealthCheck}
                        disabled={isScanning}
                     >
                        {isScanning ? 'Scanning...' : 'Health Check'}
                     </Button>

                     <Button
                        variant="primary"
                        size="sm"
                        icon={<RefreshCw className={`w-4 h-4 ${activeDownloads.size > 0 ? 'animate-spin' : ''}`} />}
                        disabled={selectedItems.size === 0 || activeDownloads.size > 0}
                        onClick={handleUpdateSelected}
                     >
                        {activeDownloads.size > 0 ? 'Updating...' : 'Update Selected'}
                     </Button>
                  </div>
               </div>

               {/* TABLE */}
               <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                     <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-950 text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800">
                           <tr>
                              <th className="px-6 py-4 w-10">
                                 <button onClick={toggleSelectAll} className="text-slate-500 hover:text-emerald-400">
                                    {selectedItems.size === marketData.length && marketData.length > 0 ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                 </button>
                              </th>
                              <th className="px-6 py-4 font-semibold">Symbol</th>
                              <th className="px-6 py-4 font-semibold">Resolution</th>
                              <th className="px-6 py-4 font-semibold">Date Range</th>
                              <th className="px-6 py-4 font-semibold">Data Health</th>
                              <th className="px-6 py-4 font-semibold text-right">Size</th>
                              <th className="px-6 py-4 font-semibold text-right">Action</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {filteredData.map((row) => (
                              <tr key={row.symbol} className={`hover:bg-slate-800/50 transition-colors ${selectedItems.has(row.symbol) ? 'bg-emerald-900/10' : ''}`}>
                                 <td className="px-6 py-4">
                                    <button onClick={() => toggleSelection(row.symbol)} className={`${selectedItems.has(row.symbol) ? 'text-emerald-500' : 'text-slate-600'}`}>
                                       {selectedItems.has(row.symbol) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                    </button>
                                 </td>
                                 <td className="px-6 py-4">
                                    <div className="font-bold text-slate-200">{row.symbol}</div>
                                    <div className="text-xs text-slate-500">{row.exchange}</div>
                                 </td>
                                 <td className="px-6 py-4">
                                    <div className="flex space-x-1">
                                       {row.timeframes.length > 0 ? row.timeframes.map(tf => (
                                          <span key={tf} className={`text-[10px] px-1.5 py-0.5 rounded border ${tf === '1m' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                             'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                             }`}>
                                             {tf}
                                          </span>
                                       )) : <span className="text-slate-600">-</span>}
                                    </div>
                                 </td>
                                 <td className="px-6 py-4 text-xs font-mono">
                                    {row.startDate !== '-' ? (
                                       <div className="flex flex-col">
                                          <span className="text-emerald-400">{row.startDate}</span>
                                          <span className="text-slate-600 text-[10px] text-center">to</span>
                                          <span className="text-slate-200">{row.lastUpdated}</span>
                                       </div>
                                    ) : <span className="text-slate-600">No Data</span>}
                                 </td>
                                 <td className="px-6 py-4">
                                    {getHealthBadge(row.health)}
                                 </td>
                                 <td className="px-6 py-4 text-right font-mono text-xs">
                                    {row.size}
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end space-x-2">
                                       {row.health === 'GAP_DETECTED' && (
                                          <Button
                                             size="sm"
                                             variant="danger"
                                             className="py-1 h-8 text-xs"
                                             onClick={() => handleDownload(row.symbol)}
                                             disabled={activeDownloads.has(row.symbol)}
                                          >
                                             {activeDownloads.has(row.symbol) ? 'Repairing...' : 'Repair'}
                                          </Button>
                                       )}
                                       <button
                                          onClick={() => handleDownload(row.symbol)}
                                          disabled={activeDownloads.has(row.symbol)}
                                          className={`p-2 rounded-lg transition-colors ${activeDownloads.has(row.symbol) ? 'text-emerald-500 animate-pulse' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                       >
                                          {activeDownloads.has(row.symbol) ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         )}

         {/* OPTIONS TAB */}
         {activeTab === 'OPTIONS' && (
            <Card title="Historical Option Chains">
               <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                  <Database className="w-16 h-16 mb-4 opacity-20" />
                  <h3 className="text-lg font-medium text-slate-200">Heavy Data Storage</h3>
                  <p className="max-w-md mb-6">
                     Historical option chains are stored in compressed Parquet format.
                     Select a symbol to manage expiry expirations.
                  </p>
                  <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-left">
                     <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase">Available Chains</div>
                     <div className="divide-y divide-slate-800">
                        <div className="px-4 py-3 flex justify-between items-center hover:bg-slate-900 cursor-pointer">
                           <div>
                              <div className="text-sm font-bold text-slate-200">NIFTY 50</div>
                              <div className="text-xs text-slate-500">Jan 2023 - Dec 2023</div>
                           </div>
                           <Badge>12.4 GB</Badge>
                        </div>
                        <div className="px-4 py-3 flex justify-between items-center hover:bg-slate-900 cursor-pointer">
                           <div>
                              <div className="text-sm font-bold text-slate-200">BANKNIFTY</div>
                              <div className="text-xs text-slate-500">Jan 2023 - Dec 2023</div>
                           </div>
                           <Badge>14.2 GB</Badge>
                        </div>
                     </div>
                  </div>
               </div>
            </Card>
         )}

         {/* IMPORT TAB */}
         {activeTab === 'IMPORT' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <Card title="Import CSV Data">
                  <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-emerald-500/50 hover:bg-emerald-900/5 transition-all cursor-pointer">
                     <Upload className="w-12 h-12 text-emerald-500 mb-4" />
                     <h3 className="text-lg font-medium text-slate-200">Drag & Drop CSV File</h3>
                     <p className="text-sm text-slate-500 mt-2 mb-6">or click to browse your file system</p>
                     <Button variant="secondary" size="sm">Select File</Button>
                     <p className="text-xs text-slate-600 mt-4">Supported formats: .csv, .txt</p>
                  </div>
               </Card>

               <Card title="Column Mapping Template">
                  <div className="space-y-4">
                     <p className="text-sm text-slate-400">Ensure your CSV has headers. Map your file columns to the system fields below.</p>

                     <div className="space-y-2">
                        {['Date / Timestamp', 'Open Price', 'High Price', 'Low Price', 'Close Price', 'Volume'].map((field) => (
                           <div key={field} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
                              <span className="text-sm font-medium text-slate-300">{field}</span>
                              <div className="flex items-center text-slate-500 text-xs">
                                 <span className="mr-2">maps to</span>
                                 <select className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-emerald-500">
                                    <option>-- Select Column --</option>
                                    <option>{field.split(' ')[0]}</option>
                                 </select>
                              </div>
                           </div>
                        ))}
                     </div>

                     <div className="pt-4 flex justify-end">
                        <Button icon={<FileText className="w-4 h-4" />}>Process Import</Button>
                     </div>
                  </div>
               </Card>
            </div>
         )}

      </div>
   );
};

export default DataManager;
