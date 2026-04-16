import React from 'react';
import { BarChart3, Upload, MessageSquare, Info, Sun, Moon } from 'lucide-react';

function Header({ activeTab, setActiveTab, hasData, theme, setTheme }) {
  const tabs = [
    { id: 'upload', label: 'Upload & Analyze', icon: Upload },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, disabled: !hasData },
    { id: 'predict', label: 'Test Prediction', icon: MessageSquare },
    { id: 'model', label: 'Model Info', icon: Info },
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <BarChart3 size={20} className="sb-brand-icon" />
        <div>
          <div className="sb-brand-title">ReviewLens</div>
          <div className="sb-brand-sub">Review Analytics</div>
        </div>
        <div className="sb-brand-actions">
          <button
            className="btn-icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      <nav className="sb-nav">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`sb-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sb-content" />

      <div className="sb-footer">
        <div className="sb-footer-text">Sentiment Analysis • ABSA • Theme Extraction</div>
      </div>
    </aside>
  );
}

export default Header;
