import React, { useState } from 'react';
import { Download, FileText, Database, Construction } from 'lucide-react';
import SentimentOverview from './dashboard/_8_SentimentOverview';
import AspectAnalysis from './dashboard/_9_AspectAnalysis';
import ThemeSummary from './dashboard/_10_ThemeSummary';
import TrendChart from './dashboard/_11_TrendChart';
import ReviewsTable from './dashboard/_12_ReviewsTable';
import { GuideButton, InfoGuideModal } from './dashboard/_7_DashboardGuide';
import { getExportUrl, exportJson } from '../_1_api';

/**
 * Dashboard is the main analysis workspace shown after a dataset is processed.
 *
 * It orchestrates:
 * 0) Consuming the already-fetched backend result passed in through `data`
 * 1) Top-level summary metadata (file, review count, sentiment badges)
 * 2) Export actions (CSV and JSON)
 * 3) Section navigation tabs (overview/aspects/themes/trends/reviews)
 * 4) Contextual in-product guidance via the guide modal
 *
 * Important boundary:
 * - this component does not fetch analysis data itself
 * - FileUpload starts and polls the backend job
 * - App stores the completed result in React state
 * - Dashboard receives that result as a prop and fans it out to child views
 *
 * Because the backend response already contains chart-ready aggregates, the
 * dashboard mostly maps response sections to visualization sections:
 * - sentiment_distribution -> overview badges + pie chart
 * - rating_distribution -> rating bar chart
 * - aspect_summary -> aspect bar/radar views
 * - aspect_theme_summary -> aspect praise/complaint cards
 * - aspect_trends -> aspect trend line chart
 * - theme_summary -> keyword cards, phrases, word cloud
 * - trends / product_trends -> time-based charts
 * - reviews -> table payload (currently WIP/hidden in navigation)

 * - Q1/Q30: This is the end-to-end view that turns uploaded reviews into
 *   structured insights for sentiment, aspects, themes, trends, and export.
 * - Q31: The reviews table is still marked WIP in the current prototype.
 * - Q32/Q35: Trends depend on date data, but export actions are available from
 *   the dashboard whenever analysis results exist.
 * - Q45: React is used here because it is well-suited to interactive,
 *   multi-view dashboard interfaces.
 *
 * @param {{
 *  data: {
 *    filename: string,
 *    total_reviews: number,
 *    was_sampled?: boolean,
 *    export_file?: string,
 *    sentiment_distribution: {
 *      positive: { count: number, percentage: number },
 *      neutral: { count: number, percentage: number },
 *      negative: { count: number, percentage: number }
 *    },
 *    aspect_summary?: Object,
 *    aspect_theme_summary?: Object,
 *    aspect_trends?: Object,
 *    theme_summary?: Object,
 *    product_summary?: Object,
 *    product_trends?: Object
 *  }
 * }} props
 */
function Dashboard({ data, activeSection, setActiveSection }) {
  // Which explanatory guide is open in the modal (null means closed).
  const [activeGuideKey, setActiveGuideKey] = useState(null);

  // User-facing error message for export actions.
  const [exportError, setExportError] = useState(null);

  /**
   * Opens backend-generated CSV output in a new tab.
   *
   * Flow:
   * 1) Clear any stale export errors
   * 2) If backend returned an export filename, open the download URL
   * 3) Otherwise show a friendly message so the UI fails gracefully
   *
   * This does not regenerate analysis. It simply downloads the CSV that the
   * backend already created during the completed analysis job.
   */
  const handleExportCSV = () => {
    setExportError(null);
    if (data.export_file) {
      window.open(getExportUrl(data.export_file), '_blank');
      return;
    }
    setExportError('CSV export is unavailable for this analysis result.');
  };

  /**
   * Builds a compact JSON payload from dashboard data and requests server-side
   * export creation. The backend returns a filename that we convert to a
   * download URL and open in a new tab.
   *
   * We export from current in-memory dashboard data instead of refetching the
   * analysis. That keeps the export consistent with what the user is viewing.
   */
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

  // Convert sentiment object into entries to compute the dominant sentiment bucket.
  const sentimentEntries = Object.entries(data.sentiment_distribution || {});

  // Pick the sentiment class with highest review count for the snapshot guide.
  const leadingSentiment = sentimentEntries.reduce(
    (best, current) => (!best || current[1].count > best[1].count ? current : best),
    null
  );

  // Content model for guide modal sections. Keep copy close to UI logic so
  // value strings can directly use the current analysis data.
  // The top summary-bar info button opens the `snapshot` entry below.
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

  // Resolve the active guide payload for modal rendering.
  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/*
        Summary bar: high-signal metrics that answer "what was analyzed?"
        and "what is the current sentiment picture?" at a glance.
      */}
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
            {/* This uses the shared guide modal system: click -> set guide key ->
                resolve `guideSections.snapshot` -> render in InfoGuideModal. */}
            <GuideButton
              label="Explain analysis snapshot"
              onClick={() => setActiveGuideKey('snapshot')}
              expanded={activeGuideKey === 'snapshot'}
              controls="dashboard-summary-guide"
            />
          </div>
        </div>
      </div>

      {/* Export feedback appears above the selected section for immediate visibility. */}
      {exportError && (
        <div className="alert alert-error" style={{ marginTop: -4 }}>
          {exportError}
        </div>
      )}

      {/* Conditional panel rendering keeps each analysis block focused and isolated. */}
      {/* Each child receives the same backend result object and is responsible only
          for view-specific reshaping such as pieData, barData, or filtered trends. */}
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

      {/* Guide modal is always mounted and controlled by activeGuide for simple open/close logic. */}
      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="dashboard-summary-guide"
      />
    </div>
  );
}

/**
 * WipBanner marks unfinished dashboard modules while still allowing integration testing
 * of navigation, layout spacing, and data flow around in-progress features.
 */
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
