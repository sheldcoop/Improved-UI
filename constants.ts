import { LucideIcon, LayoutDashboard, Database, Sliders, PlayCircle, BarChart2, BookOpen, Settings, Layers, PieChart, Activity, Zap, ClipboardList } from 'lucide-react';

export const APP_NAME = "VectorBT Pro Plus";

export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Quant Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Option Builder', path: '/options', icon: Layers },
  { name: 'Strategy Builder', path: '/strategy', icon: Sliders },
  { name: 'Backtest Engine', path: '/backtest', icon: PlayCircle },
  { name: 'Optimization (WFO)', path: '/optimization', icon: Zap }, // New
  { name: 'Risk Analysis (MC)', path: '/risk', icon: Activity }, // New
  { name: 'Paper Trading', path: '/paper-trading', icon: ClipboardList }, // New
  { name: 'Analytics', path: '/results', icon: PieChart },
  { name: 'Data Manager', path: '/data', icon: Database },
  { name: 'Journal', path: '/journal', icon: BookOpen },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const MOCK_SYMBOLS = [
  { symbol: 'NIFTY 50', exchange: 'NSE', lastPrice: 22150.50, changePct: 0.45, ivPercentile: 24, dataAvailable: true, lastUpdated: '2024-02-23' },
  { symbol: 'BANKNIFTY', exchange: 'NSE', lastPrice: 46500.20, changePct: -0.12, ivPercentile: 45, dataAvailable: true, lastUpdated: '2024-02-23' },
  { symbol: 'RELIANCE', exchange: 'NSE', lastPrice: 2950.00, changePct: 1.2, ivPercentile: 80, dataAvailable: true, lastUpdated: '2024-02-23' },
  { symbol: 'HDFCBANK', exchange: 'NSE', lastPrice: 1420.00, changePct: -0.5, ivPercentile: 12, dataAvailable: false, lastUpdated: '-' },
  { symbol: 'INFY', exchange: 'NSE', lastPrice: 1650.00, changePct: 0.8, ivPercentile: 30, dataAvailable: true, lastUpdated: '2024-02-20' },
  { symbol: 'ADANIENT', exchange: 'NSE', lastPrice: 3200.00, changePct: 2.5, ivPercentile: 92, dataAvailable: true, lastUpdated: '2024-02-23' },
];

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const UNIVERSES = [
    { id: 'NIFTY_50', name: 'NIFTY 50 Constituents' },
    { id: 'BANK_NIFTY', name: 'NIFTY BANK Sector' },
    { id: 'IT_SECTOR', name: 'NIFTY IT Sector' },
    { id: 'MOMENTUM', name: 'High Momentum Stocks' }
];