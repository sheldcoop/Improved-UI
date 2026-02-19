export const CONFIG = {
  // Toggle this to switch between Mock Data and your Python Flask Backend
  USE_MOCK_DATA: false,

  // Your Backend URL (e.g., Python Flask running on port 5000)
  API_BASE_URL: 'http://localhost:5001/api/v1',

  // App Settings
  DEFAULT_TIMEFRAME: '1d',
  DEFAULT_ASSET_CLASS: 'EQUITY',

  // NOTE: BROKER and DATA_PROVIDER are intentionally removed.
  // The backend reads the active data provider from the x-use-alpha-vantage
  // request header (set in services/http.ts). Broker mode is controlled
  // server-side via backend/.env (DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN).

  // Charting Colors
  COLORS: {
    PROFIT: '#10b981', // Emerald 500
    LOSS: '#ef4444',   // Red 500
    NEUTRAL: '#6366f1', // Indigo 500
    GRID: '#1e293b',    // Slate 800
    TEXT: '#64748b'     // Slate 500
  },

  // Mock Constants (moved here to keep logic clean)
  MOCK_DELAY_MS: 800,
};

export const API_ENDPOINTS = {
  STRATEGIES: '/strategies',
  BACKTEST: '/backtest/run',
  OPTION_CHAIN: '/market/option-chain',
  MARKET_VALIDATE: '/market/validate',
  OPTIMIZATION: '/optimization/run',
  MONTE_CARLO: '/optimization/monte-carlo',
  PAPER_TRADING: '/paper-trading/positions',
  VALIDATE_KEY: '/validate-key',
  DHAN_STATUS: '/broker/dhan/status',
  DHAN_SAVE: '/broker/dhan/save',
  DHAN_TEST: '/broker/dhan/test',
};