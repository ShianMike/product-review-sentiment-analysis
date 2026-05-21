import React, { useState, useEffect } from 'react';
import Header from './components/_2_Header';
import FileUpload from './components/_3_FileUpload';
import Dashboard from './components/_4_Dashboard';
import SinglePredict from './components/_5_SinglePredict';
import ModelInfo from './components/_6_ModelInfo';
import './App.css';

/**
 * App is the top-level coordinator for the frontend.
 *
 * Fetch/visualization handoff:
 * - FileUpload performs the async backend requests
 * - once analysis completes, FileUpload calls handleAnalysisComplete(data)
 * - App stores that backend result in analysisData
 * - App switches the visible tab to "dashboard"
 * - Dashboard and its child chart components receive the same analysisData
 *
 * This makes the data path easy to explain in a presentation:
 * upload -> backend analysis job -> completed result payload -> React state ->
 * dashboard visualizations.
 *
 * Project.txt link:
 * This component coordinates the main user-facing sections required by the
 * project: Upload, Dashboard, Test Prediction, and Model Info.
 */
function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [activeSection, setActiveSection] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  // Store the backend analysis payload once and let child views read from the
  // same source of truth instead of refetching independently.
  const handleAnalysisComplete = (data) => {
    setAnalysisData(data);
    setActiveTab('dashboard');
  };

  return (
    <div className="app">
      {/* These tabs match the main workflow described in Project.txt. */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasData={!!analysisData}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        theme={theme}
        setTheme={setTheme}
      />

      <main className="main-content">
        {activeTab === 'upload' && (
          <FileUpload
            onAnalysisComplete={handleAnalysisComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        )}

        {activeTab === 'dashboard' && analysisData && (
          // Dashboard receives the fully fetched analysis payload and turns it
          // into charts, summaries, trends, and export actions.
          <Dashboard data={analysisData} activeSection={activeSection} setActiveSection={setActiveSection} />
        )}

        {activeTab === 'predict' && (
          <SinglePredict />
        )}

        {activeTab === 'model' && (
          <ModelInfo />
        )}
      </main>
    </div>
  );
}

export default App;
