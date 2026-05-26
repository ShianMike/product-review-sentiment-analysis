import React, { useState } from 'react';
import { Download, FileText, Database } from 'lucide-react';
import SentimentOverview from './dashboard/_9_SentimentOverview';
import AspectAnalysis from './dashboard/_10_AspectAnalysis';
import ThemeSummary from './dashboard/_11_ThemeSummary';
import TrendChart from './dashboard/_12_TrendChart';
import ReviewsTable from './dashboard/_13_ReviewsTable';
import { GuideButton, InfoGuideModal } from './dashboard/_8_DashboardGuide';
import { getExportUrl, exportJson } from '../_1_api';

/**
 * Dashboard shows the finished analysis result after the upload process ends.
 *
 * Simple flow:
 * Step 1: FileUpload sends the file to the backend and waits for the result.
 * Step 2: App stores that finished result in React state.
 * Step 3: Dashboard receives the result through `data`.
 * Step 4: Dashboard shows the summary bar, export buttons, and selected tab.
 *
 * This file does not run the AI model and does not upload the file. It only
 * displays the result that was already prepared by the backend.
 *
 * Main fields used by the Overview tab:
 * - sentiment_distribution shows positive, neutral, and negative totals.
 * - rating_distribution shows the star rating counts, if the file has ratings.
 * - product_summary shows product-level sentiment and product filter options.
 * - aspect_summary shows the most mentioned product topics.
 * - theme_summary shows top keywords, praises, and complaints.
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
  // Which guide popup is open right now. null means no popup is open.
  const [activeGuideKey, setActiveGuideKey] = useState(null);

  // Short error message shown if a download fails.
  const [exportError, setExportError] = useState(null);

  /**
   * Download CSV.
   *
   * How it works:
   * Step 1: The backend already made a processed CSV after analysis.
   * Step 2: `data.export_file` stores that CSV filename.
   * Step 3: This button opens the backend download link in a new tab.
   *
   * This does not analyze the file again. It only downloads the ready CSV.
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
   * Download JSON.
   *
   * How it works:
   * Step 1: Take the current dashboard summary from `data`.
   * Step 2: Send that summary to the backend.
   * Step 3: The backend saves it as a JSON file.
   * Step 4: Open the backend download link for that JSON file.
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

  // Turn the sentiment object into a list so we can find the biggest group.
  const sentimentEntries = Object.entries(data.sentiment_distribution || {});

  // This is the largest sentiment group: positive, neutral, or negative.
  const leadingSentiment = sentimentEntries.reduce(
    (best, current) => (!best || current[1].count > best[1].count ? current : best),
    null
  );

  // Text for the small info button in the top summary bar.
  // It uses the actual loaded result, so the guide matches the current file.
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

  // Look up the guide entry that matches the button the user clicked.
  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/*
        Summary bar at the top. It answers two simple questions:
        "What file was analyzed?" and "How does the sentiment look?".
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
            {/* CSV downloads the processed review rows. JSON downloads summary data. */}
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <Download size={14} /> CSV
            </button>
            <button className="btn btn-secondary" onClick={handleExportJSON}>
              <Database size={14} /> JSON
            </button>
            {/* Uses the shared guide popup. When clicked, it sets the guide key,
                looks up `guideSections.snapshot`, and shows it in InfoGuideModal. */}
            <GuideButton
              label="Explain analysis snapshot"
              onClick={() => setActiveGuideKey('snapshot')}
              expanded={activeGuideKey === 'snapshot'}
              controls="dashboard-summary-guide"
            />
          </div>
        </div>
      </div>

      {/* Show the download error right above the section so the user sees it fast. */}
      {exportError && (
        <div className="alert alert-error" style={{ marginTop: -4 }}>
          {exportError}
        </div>
      )}

      {/* Show only the section the user picked. Each section is its own card. */}
      {/* All children get the same backend result. They only do small reshaping */}
      {/* for their own charts (pie data, bar data, filtered trends, and so on). */}
      {activeSection === 'overview' && <SentimentOverview data={data} />}
      {activeSection === 'aspects' && <AspectAnalysis data={data} />}
      {activeSection === 'themes' && <ThemeSummary data={data} />}
      {activeSection === 'trends' && <TrendChart data={data} />}
      {activeSection === 'reviews' && <ReviewsTable data={data} />}

      {/* The guide popup is always in the DOM. It opens when activeGuide is set
          and closes when it is null, so the open/close logic stays simple. */}
      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="dashboard-summary-guide"
      />
    </div>
  );
}

export default Dashboard;
