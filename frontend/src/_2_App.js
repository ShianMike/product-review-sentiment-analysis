import React, { useState, useEffect } from 'react';
import Header from './components/_3_Header';
import FileUpload from './components/_4_FileUpload';
import Dashboard from './components/_5_Dashboard';
import SinglePredict from './components/_6_SinglePredict';
import ModelInfo from './components/_7_ModelInfo';
import './_2_App.css';

/**
 * App is the top-level coordinator for the frontend.
 *
 * Frontend flow:
 * - FileUpload performs the async backend requests
 * - once analysis completes, FileUpload calls handleAnalysisComplete(data)
 * - App stores that backend result in analysisData
 * - App switches the visible tab to "dashboard"
 * - Dashboard and its child chart components receive the same analysisData
 *
 * Simple presentation line:
 * upload -> backend analysis job -> completed result -> React state ->
 * dashboard visualizations.
 */
function App() {
  // App owns the shared state that connects the upload step to the dashboard.
  // Child components receive setters/callbacks instead of using global state.
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
      {/* Header controls the main pages: Upload, Dashboard, Predict, and Model Info. */}
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
