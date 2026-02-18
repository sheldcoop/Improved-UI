import { LucideIcon, LayoutDashboard, Database, Sliders, PlayCircle, BarChart2, BookOpen, Settings } from 'lucide-react';

export const APP_NAME = "VectorBT Pro Plus";

export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Data Manager', path: '/data', icon: Database },
  { name: 'Strategy Builder', path: '/strategy', icon: Sliders },
  { name: 'Backtest', path: '/backtest', icon: PlayCircle },
  { name: 'Results', path: '/results', icon: BarChart2 },
  { name: 'Journal', path: '/journal', icon: BookOpen },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const MOCK_SYMBOLS = [
  { symbol: 'NIFTY 50', exchange: 'NSE', lastPrice: 22150.50, dataAvailable: true, lastUpdated: '2024-02-23' },
  { symbol: 'BANKNIFTY', exchange: 'NSE', lastPrice: 46500.20, dataAvailable: true, lastUpdated: '2024-02-23' },
  { symbol: 'RELIANCE', exchange: 'NSE', lastPrice: 2950.00, dataAvailable: true, lastUpdated: '2024-02-23' },
  { symbol: 'HDFCBANK', exchange: 'NSE', lastPrice: 1420.00, dataAvailable: false, lastUpdated: '-' },
  { symbol: 'INFY', exchange: 'NSE', lastPrice: 1650.00, dataAvailable: true, lastUpdated: '2024-02-20' },
];
