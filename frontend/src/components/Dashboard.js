import React, { useState } from 'react';
import { Download, FileText, Database, Construction } from 'lucide-react';
import SentimentOverview from './dashboard/SentimentOverview';
import AspectAnalysis from './dashboard/AspectAnalysis';
import ThemeSummary from './dashboard/ThemeSummary';
import TrendChart from './dashboard/TrendChart';
import ReviewsTable from './dashboard/ReviewsTable';
import { GuideButton, InfoGuideModal } from './dashboard/DashboardGuide';
import { getExportUrl, exportJson } from '../api';

// Demo guide: this screen is the main evidence that the prototype is already working.
function Dashboard({ data }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [activeGuideKey, setActiveGuideKey] = useState(null);
  const [exportError, setExportError] = useState(null);

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'aspects', label: 'Aspects' },
    { id: 'themes', label: 'Themes' },
    { id: 'trends', label: 'Trends' },
    { id: 'reviews', label: 'Reviews (WIP)', disabled: true },
  ];

  const handleExportCSV = () => {
    setExportError(null);
    if (data.export_file) {
      window.open(getExportUrl(data.export_file), '_blank');
      return;
    }
    setExportError('CSV export is unavailable for this analysis result.');
  };

  const handleExportJSON = async () => {
    try {
      setExportError(null);
      const response = await exportJson({
        sentiment_distribution: data.sentiment_distribution,
        aspect_summary: data.aspect_summary,
        aspect_theme_summary: data.aspect_theme_summary,
        aspect_trends: data.aspect_trends,
        theme_summary: data.theme_summary,
        product_summary: data.product_summary,
        product_trends: data.product_trends,
        total_reviews: data.total_reviews,
      });
      window.open(getExportUrl(response.data.filename), '_blank');
    } catch (err) {
      setExportError(err.response?.data?.error || err.message || 'Export failed');
    }
  };

  const sentimentEntries = Object.entries(data.sentiment_distribution || {});
  const leadingSentiment = sentimentEntries.reduce(
    (best, current) => (!best || current[1].count > best[1].count ? current : best),
    null
  );

  const guideSections = {
    snapshot: {
      title: 'Analysis Snapshot',
      description: 'This top strip gives a quick summary of what file was analyzed, how many reviews were processed, and what the overall sentiment mix looks like.',
      items: [
        {
          label: 'Current File',
          value: data.filename || 'Unavailable',
          description: data.filename
            ? `Current result: ${data.filename} is the dataset currently loaded into the dashboard.`
            : 'Current result: no filename is available for this analysis.',
        },
        {
          label: 'Reviews Processed',
          value: `${data.total_reviews.toLocaleString()} reviews`,
          description: data.was_sampled
            ? `Current result: ${data.total_reviews.toLocaleString()} reviews are shown because the backend sampled the dataset to keep the analysis responsive.`
            : `Current result: ${data.total_reviews.toLocaleString()} reviews were processed from the uploaded dataset.`,
        },
        {
          label: 'Leading Sentiment',
          value: leadingSentiment ? `${leadingSentiment[0]} (${leadingSentiment[1].percentage}%)` : 'Unavailable',
          description: leadingSentiment
            ? `Current result: ${leadingSentiment[0]} is the largest sentiment group, so it is the dominant mood in this dataset right now.`
            : 'Current result: the dashboard could not determine which sentiment is leading.',
        },
        {
          label: 'Export Actions',
          value: 'CSV and JSON',
          description: 'These buttons download either the processed review-level results as CSV or the dashboard summary metrics as JSON for reporting or reuse.',
        },
      ],
    },
  };

  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary Bar */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div className="section-label">File</div>
              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                {data.filename}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
            <div>
              <div className="section-label">Total Reviews</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                {data.total_reviews.toLocaleString()}
                {data.was_sampled && <span className="badge-accent" style={{ fontSize: 9, marginLeft: 6, padding: '2px 6px' }}>SAMPLED</span>}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="badge badge-positive">{data.sentiment_distribution.positive.percentage}% pos</span>
              <span className="badge badge-neutral">{data.sentiment_distribution.neutral.percentage}% neu</span>
              <span className="badge badge-negative">{data.sentiment_distribution.negative.percentage}% neg</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <Download size={14} /> CSV
            </button>
            <button className="btn btn-secondary" onClick={handleExportJSON}>
              <Database size={14} /> JSON
            </button>
            <GuideButton
              label="Explain analysis snapshot"
              onClick={() => setActiveGuideKey('snapshot')}
              expanded={activeGuideKey === 'snapshot'}
              controls="dashboard-summary-guide"
            />
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => !section.disabled && setActiveSection(section.id)}
            disabled={section.disabled}
            className={`btn btn-secondary ${activeSection === section.id ? 'active' : ''}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {exportError && (
        <div className="alert alert-error" style={{ marginTop: -4 }}>
          {exportError}
        </div>
      )}

      {activeSection === 'overview' && <SentimentOverview data={data} />}
      {activeSection === 'aspects' && <AspectAnalysis data={data} />}
      {activeSection === 'themes' && <ThemeSummary data={data} />}
      {activeSection === 'trends' && <TrendChart data={data} />}
      {activeSection === 'reviews' && (
        <>
          <WipBanner label="Reviews Table" />
          <ReviewsTable data={data} />
        </>
      )}

      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="dashboard-summary-guide"
      />
    </div>
  );
}

function WipBanner({ label }) {
  return (
    <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Construction size={16} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{label} — Work in Progress</div>
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>This section is still under development and may not reflect the final design.</div>
      </div>
    </div>
  );
}

export default Dashboard;
