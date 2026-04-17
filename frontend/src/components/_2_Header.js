import React from 'react';
import { BarChart3, Sun, Moon } from 'lucide-react';

const NAV_TABS = [
  {
    id: 'upload',
    label: 'Upload & Analyze',
    icon: (
      <svg className="sb2-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    requiresData: true,
    icon: (
      <svg className="sb2-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    id: 'predict',
    label: 'Test Prediction',
    icon: (
      <svg className="sb2-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: 'model',
    label: 'Model Info',
    icon: (
      <svg className="sb2-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const DASHBOARD_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'aspects',  label: 'Aspects' },
  { id: 'themes',   label: 'Themes' },
  { id: 'trends',   label: 'Trends' },
  { id: 'reviews',  label: 'Reviews', disabled: true },
];

function Header({ activeTab, setActiveTab, hasData, activeSection, setActiveSection, theme, setTheme }) {
  return (
    <aside className="sidebar">
      {/* Brand header */}
      <div className="sb2-brand">
        <div className="sb2-brand-left">
          <div className="sb2-brand-icon">
            <BarChart3 size={22} />
          </div>
          <div>
            <div className="sb2-brand-title">ReviewLens</div>
            <div className="sb2-brand-sub">Review Analytics</div>
          </div>
        </div>
        <button
          className="sb2-theme-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      {/* Main nav + sub-nav */}
      <nav className="sb2-nav">
        {/* Primary tabs */}
        <div className="sb2-nav-group">
          {NAV_TABS.map((tab) => {
            const disabled = tab.requiresData && !hasData;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => !disabled && setActiveTab(tab.id)}
                disabled={disabled}
                className={`sb2-tab ${active ? 'sb2-tab-active' : ''} ${disabled ? 'sb2-tab-disabled' : ''}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dashboard view sub-nav */}
        {activeTab === 'dashboard' && hasData && (
          <div className="sb2-subnav">
            <div className="sb2-subnav-header">
              <svg className="sb2-subnav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
              </svg>
              <span className="sb2-subnav-label">View</span>
            </div>
            <div className="sb2-subnav-items">
              {DASHBOARD_SECTIONS.map((sec) => {
                const active = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => !sec.disabled && setActiveSection(sec.id)}
                    disabled={sec.disabled}
                    className={`sb2-subnav-item ${active ? 'sb2-subnav-item-active' : ''} ${sec.disabled ? 'sb2-subnav-item-disabled' : ''}`}
                  >
                    <span>{sec.label}</span>
                    {sec.disabled && <span className="sb2-wip-badge">WIP</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="sb2-footer">
        <p className="sb2-footer-text">Sentiment Analysis • ABSA • Theme Extraction</p>
      </div>
    </aside>
  );
}

export default Header;
