import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import StrategyBuilder from './pages/StrategyBuilder';
import OptionsBuilder from './pages/OptionsBuilder';
import Backtest from './pages/Backtest';
import Results from './pages/Results';
import Optimization from './pages/Optimization';
import RiskAnalysis from './pages/RiskAnalysis';
import PaperTrading from './pages/PaperTrading';
import DataManager from './pages/DataManager';
import Journal from './pages/Journal';
import Settings from './pages/Settings';

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/options" element={<OptionsBuilder />} />
          <Route path="/strategy" element={<StrategyBuilder />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/results" element={<Results />} />
          <Route path="/optimization" element={<Optimization />} />
          <Route path="/risk" element={<RiskAnalysis />} />
          <Route path="/paper-trading" element={<PaperTrading />} />
          <Route path="/data" element={<DataManager />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
