import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import SinglePredict from './components/SinglePredict';
import ModelInfo from './components/ModelInfo';
import './App.css';

function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const handleAnalysisComplete = (data) => {
    setAnalysisData(data);
    setActiveTab('dashboard');
  };

  return (
    <div className="app">
      {/* Demo guide: these tabs match the main progress-demo flow of the prototype. */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasData={!!analysisData}
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
          <Dashboard data={analysisData} />
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
