// _9_AspectAnalysis.js
// ─────────────────────────────────────────────────────────────────────────────
// Renders the "Aspects" tab of the dashboard.
//
// Aspect-Based Sentiment Analysis (ABSA) groups review text by product topic
// (price, quality, delivery, etc.) and scores each topic independently.
//
// Data flow:
//   1. Default data comes from the global analysis payload in props.
//   2. When the user picks a specific product, handleProductChange fetches
//      product-scoped aspect/theme/trend data from the backend.
//   3. Derived state (barData, radarData, filteredSelectedAspectTrend) is
//      memoized and recomputed only when its direct inputs change.
//   4. Clicking an aspect row in the list opens a detail panel showing that
//      aspect's polarity, phrase themes, and time-series trend.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  LineChart, Line,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Tag, ArrowUpRight, ArrowDownRight, Target, Download, Database, TrendingUp, ChevronDown } from 'lucide-react';
import { GuideButton, CardHeaderWithGuide, InfoGuideModal } from './_7_DashboardGuide';
import { exportAspectsCsv, exportAspectsJson, getExportUrl, getProductAnalysis } from '../../_1_api';

const COLORS = {
  positive: '#22c55e',
  neutral: '#eab308',
  negative: '#ef4444',
};

function truncateId(text, max = 50) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '…';
}

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  color: 'var(--text-secondary)',
};

/**
 * AspectAnalysis visualizes the aspect-focused slices of the fetched result.
 *
 * It receives:
 * - aspect_summary from the backend ABSA aggregation
 * - aspect_theme_summary for praise/complaint drill-down
 * - aspect_trends for month-level aspect trend lines
 *
 * This component performs frontend-only reshaping so the chart library can
 * render the data, but it does not recompute aspect analytics itself.
 */
function AspectAnalysis({ data }) {
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [productData, setProductData] = useState(null);
  const [productLoading, setProductLoading] = useState(false);

  // Product list comes from the product summary computed during the main analysis.
  const allProducts = data.product_summary?.top_products || [];
  const hasProducts = allProducts.length > 1 && Boolean(data.export_file);

  // When a product is selected, fetch its aspect/theme data from the backend.
  // selectedAspect is also reset so the detail panel doesn't show stale data
  // from the previous product or the global dataset.
  const handleProductChange = useCallback(async (productId) => {
    setSelectedProduct(productId);
    setSelectedAspect(null);

    if (productId === 'all') {
      setProductData(null);
      return;
    }

    try {
      setProductLoading(true);
      const response = await getProductAnalysis(data.export_file, productId);
      setProductData(response.data);
    } catch {
      setProductData(null);
    } finally {
      setProductLoading(false);
    }
  }, [data.export_file]);

  // Use product-filtered data when a product is selected, otherwise use global data.
  // The fallback to `data.*` means the component always has something to render
  // even while productData is still loading.
  const aspect_summary = (selectedProduct !== 'all' && productData?.aspect_summary) || data.aspect_summary;
  const aspect_theme_summary = (selectedProduct !== 'all' && productData?.aspect_theme_summary) || data.aspect_theme_summary;
  const aspect_trends = (selectedProduct !== 'all' && productData?.aspect_trends) || data.aspect_trends;

  const [selectedAspect, setSelectedAspect] = useState(null);
  const [activeGuideKey, setActiveGuideKey] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [aspectTrendStartMonth, setAspectTrendStartMonth] = useState('');
  const [aspectTrendEndMonth, setAspectTrendEndMonth] = useState('');

  const hasAspects = Boolean(aspect_summary && Object.keys(aspect_summary).length > 0);
  const aspectEntries = hasAspects
    ? Object.entries(aspect_summary).sort((a, b) => b[1].total_mentions - a[1].total_mentions)
    : [];
  const totalMentions = hasAspects
    ? aspectEntries.reduce((sum, [, s]) => sum + s.total_mentions, 0)
    : 0;

  const bestAspect = hasAspects
    ? aspectEntries.reduce((best, curr) => (curr[1].avg_polarity > best[1].avg_polarity ? curr : best))
    : null;
  const worstAspect = hasAspects
    ? aspectEntries.reduce((worst, curr) => (curr[1].avg_polarity < worst[1].avg_polarity ? curr : worst))
    : null;
  const mostMentioned = hasAspects ? aspectEntries[0] : null;

  // Stacked bar chart data: one row per aspect with positive/neutral/negative counts.
  const barData = aspectEntries.map(([aspect, stats]) => ({
    aspect: toTitleCase(aspect),
    Positive: stats.positive_count,
    Neutral: stats.neutral_count,
    Negative: stats.negative_count,
    total: stats.total_mentions,
    avg_polarity: stats.avg_polarity,
  }));

  // Radar chart expects one numeric score per axis. We remap polarity from
  // [-1, 1] into [0, 100] so the chart reads as negative -> neutral -> positive.
  // Formula: (polarity + 1) * 50 maps -1 -> 0, 0 -> 50, +1 -> 100.
  const radarData = aspectEntries.map(([aspect, stats]) => ({
    aspect: toTitleCase(aspect),
    polarity: Math.round((stats.avg_polarity + 1) * 50),
    mentions: stats.total_mentions,
  }));

  const activeDetail = hasAspects && selectedAspect ? aspect_summary[selectedAspect] : null;
  const selectedAspectThemes = selectedAspect ? aspect_theme_summary?.[selectedAspect] : null;
  const selectedAspectTrend = useMemo(() => {
    if (!selectedAspect) {
      return [];
    }
    // Backend already grouped trend points by aspect name. We only pick the
    // currently selected aspect's series for the line chart.
    const trendPoints = aspect_trends?.aspects?.[selectedAspect];
    return Array.isArray(trendPoints) ? trendPoints : [];
  }, [selectedAspect, aspect_trends]);

  // Normalize month strings to YYYY-MM format (some backend responses include
  // a day component like 2024-03-01; slicing to 7 chars keeps them uniform)
  // and sort chronologically so Recharts renders a left-to-right time axis.
  const normalizedSelectedAspectTrend = useMemo(
    () => selectedAspectTrend
      .map((point) => {
        const rawMonth = String(point.month || '');
        const month = rawMonth.length > 7 ? rawMonth.substring(0, 7) : rawMonth;
        return {
          ...point,
          month,
        };
      })
      .sort((a, b) => String(a.month).localeCompare(String(b.month))),
    [selectedAspectTrend],
  );

  const aspectTrendMonthOptions = useMemo(
    () => Array.from(new Set(normalizedSelectedAspectTrend.map((point) => point.month))),
    [normalizedSelectedAspectTrend],
  );

  useEffect(() => {
    if (aspectTrendMonthOptions.length === 0) {
      setAspectTrendStartMonth('');
      setAspectTrendEndMonth('');
      return;
    }

    setAspectTrendStartMonth(aspectTrendMonthOptions[0]);
    setAspectTrendEndMonth(aspectTrendMonthOptions[aspectTrendMonthOptions.length - 1]);
  }, [selectedAspect, aspectTrendMonthOptions]);

  const defaultAspectTrendStartMonth = aspectTrendMonthOptions[0] || '';
  const defaultAspectTrendEndMonth = aspectTrendMonthOptions[aspectTrendMonthOptions.length - 1] || '';
  const selectedAspectTrendStartMonth = aspectTrendMonthOptions.includes(aspectTrendStartMonth)
    ? aspectTrendStartMonth
    : defaultAspectTrendStartMonth;
  const selectedAspectTrendEndMonth = aspectTrendMonthOptions.includes(aspectTrendEndMonth)
    ? aspectTrendEndMonth
    : defaultAspectTrendEndMonth;

  const filteredSelectedAspectTrend = useMemo(
    () => normalizedSelectedAspectTrend.filter((point) => {
      const isAfterStart = !selectedAspectTrendStartMonth || point.month >= selectedAspectTrendStartMonth;
      const isBeforeEnd = !selectedAspectTrendEndMonth || point.month <= selectedAspectTrendEndMonth;
      return isAfterStart && isBeforeEnd;
    }),
    [normalizedSelectedAspectTrend, selectedAspectTrendStartMonth, selectedAspectTrendEndMonth],
  );

  const handleAspectTrendStartMonthChange = (event) => {
    const nextStart = event.target.value;
    setAspectTrendStartMonth(nextStart);
    // Guard: if the user pushes the start month past the current end month,
    // snap the end month forward to match so the range stays valid.
    if (selectedAspectTrendEndMonth && nextStart > selectedAspectTrendEndMonth) {
      setAspectTrendEndMonth(nextStart);
    }
  };

  const handleAspectTrendEndMonthChange = (event) => {
    const nextEnd = event.target.value;
    setAspectTrendEndMonth(nextEnd);
    // Guard: if the user pulls the end month before the current start month,
    // snap the start month back to match.
    if (selectedAspectTrendStartMonth && nextEnd < selectedAspectTrendStartMonth) {
      setAspectTrendStartMonth(nextEnd);
    }
  };

  const resetAspectTrendRange = () => {
    setAspectTrendStartMonth(defaultAspectTrendStartMonth);
    setAspectTrendEndMonth(defaultAspectTrendEndMonth);
  };

  const isDefaultAspectTrendRange = selectedAspectTrendStartMonth === defaultAspectTrendStartMonth
    && selectedAspectTrendEndMonth === defaultAspectTrendEndMonth;

  const actionInsights = useMemo(
    () => buildActionInsights({
      selectedAspect,
      activeDetail,
      selectedAspectThemes,
      selectedAspectTrend,
    }),
    [selectedAspect, activeDetail, selectedAspectThemes, selectedAspectTrend],
  );

  // Build the export payload once and reuse it for both CSV and JSON.
  // This keeps the export handlers simple and ensures both formats contain
  // the same data snapshot.
  const createAspectExportPayload = () => ({
    filename: data.filename,
    total_reviews: data.total_reviews,
    generated_at: new Date().toISOString(),
    aspect_summary,
    aspect_theme_summary: aspect_theme_summary || {},
    aspect_trends: aspect_trends || null,
  });

  const handleExportAspects = async (format) => {
    try {
      setExportError(null);
      setIsExporting(true);

      const payload = createAspectExportPayload();
      const response = format === 'csv'
        ? await exportAspectsCsv(payload)
        : await exportAspectsJson(payload);

      window.open(getExportUrl(response.data.filename), '_blank');
    } catch (err) {
      setExportError(err.response?.data?.error || err.message || 'Aspect export failed');
    } finally {
      setIsExporting(false);
    }
  };

  if (!hasAspects) {
    return (
      <div className="state state-empty">
        <h3>No aspects detected</h3>
        <p>Aspects like quality, price, delivery, taste, etc. are extracted automatically.</p>
      </div>
    );
  }

  // Aspect-section info buttons read from this map.
  // Some guides are always available (best/worst/radar/export), while others
  // only exist when an aspect is selected so the modal can explain that
  // specific aspect's live counts, phrases, and trend points.
  const guideSections = {
    best: {
      title: 'Best Rated Aspect',
      description: 'This highlight card points to the aspect with the strongest average sentiment score.',
      items: [
        {
          label: 'Current Leader',
          value: `${toTitleCase(bestAspect[0])} (+${bestAspect[1].avg_polarity.toFixed(2)})`,
          description: `Current result: ${bestAspect[0]} has the highest average polarity, so it is the aspect people describe most favorably.`,
        },
        {
          label: 'Mentions Behind It',
          value: bestAspect[1].total_mentions.toLocaleString(),
          description: `Current result: this score is based on ${bestAspect[1].total_mentions.toLocaleString()} mentions of ${bestAspect[0]}.`,
        },
        {
          label: 'How To Read It',
          value: 'Higher polarity = more favorable',
          description: 'Average polarity moves from negative values to positive values. The more positive the number, the more favorable the language attached to that aspect.',
        },
      ],
    },
    worst: {
      title: 'Worst Rated Aspect',
      description: 'This card highlights the aspect with the weakest average sentiment score.',
      items: [
        {
          label: 'Current Risk Area',
          value: `${toTitleCase(worstAspect[0])} (${worstAspect[1].avg_polarity.toFixed(2)})`,
          description: `Current result: ${worstAspect[0]} has the lowest polarity score, so it is the aspect receiving the harshest language overall.`,
        },
        {
          label: 'Mentions Behind It',
          value: worstAspect[1].total_mentions.toLocaleString(),
          description: `Current result: ${worstAspect[1].total_mentions.toLocaleString()} mentions contributed to this aspect's average score.`,
        },
        {
          label: 'How To Use It',
          value: 'Improvement target',
          description: 'Beginners can treat this card as the clearest signal of where the product or service experience may need attention first.',
        },
      ],
    },
    mentioned: {
      title: 'Most Mentioned Aspect',
      description: 'This card shows which aspect appears most frequently in the reviews, regardless of whether the comments are positive or negative.',
      items: [
        {
          label: 'Top Topic',
          value: `${toTitleCase(mostMentioned[0])} (${mostMentioned[1].total_mentions.toLocaleString()})`,
          description: `Current result: ${mostMentioned[0]} is the most frequently discussed topic in the dataset.`,
        },
        {
          label: 'Share Of All Mentions',
          value: `${((mostMentioned[1].total_mentions / totalMentions) * 100).toFixed(1)}%`,
          description: 'This tells users how much of the total aspect conversation is concentrated in one topic.',
        },
        {
          label: 'Why It Matters',
          value: 'Conversation priority',
          description: 'Even if an aspect is not the most positive or negative, a very high mention share means it strongly shapes the overall customer conversation.',
        },
      ],
    },
    aspectList: {
      title: 'All Aspects',
      description: 'This panel lists every detected aspect and lets the user click one to inspect its detailed results.',
      items: [
        {
          label: 'Detected Aspects',
          value: aspectEntries.length.toLocaleString(),
          description: `Current result: the analyzer found ${aspectEntries.length.toLocaleString()} distinct product or service topics in the review text.`,
        },
        {
          label: 'Selected Aspect',
          value: selectedAspect ? toTitleCase(selectedAspect) : 'None selected',
          description: selectedAspect
            ? `Current result: ${selectedAspect} is selected, so the detail card shows the sentiment breakdown for that topic.`
            : 'Current result: no aspect is selected yet. Clicking any row opens a more detailed breakdown for that topic.',
        },
        {
          label: 'How To Read It',
          value: 'Color bar = sentiment split',
          description: 'Each row uses a stacked green, yellow, and red bar to show how mentions of that aspect are divided across positive, neutral, and negative sentiment.',
        },
      ],
    },
    selected: activeDetail && {
      title: 'Selected Aspect Detail',
      description: 'This card explains the currently selected aspect using its polarity, mention count, and sentiment breakdown.',
      items: [
        {
          label: 'Selected Aspect',
          value: toTitleCase(selectedAspect),
          description: `Current result: the detail view is currently focused on ${selectedAspect}.`,
        },
        {
          label: 'Average Polarity',
          value: `${activeDetail.avg_polarity > 0 ? '+' : ''}${activeDetail.avg_polarity.toFixed(2)}`,
          description: activeDetail.avg_polarity >= 0
            ? 'Current result: the sentiment around this aspect leans favorable on average.'
            : 'Current result: the sentiment around this aspect leans unfavorable on average.',
        },
        {
          label: 'Sentiment Counts',
          value: `${activeDetail.positive_count} / ${activeDetail.neutral_count} / ${activeDetail.negative_count}`,
          description: 'Read these in order as positive, neutral, and negative mentions. This makes it easy to understand whether the topic is consistently praised or more divisive.',
        },
      ],
    },
    aspectThemes: activeDetail && selectedAspectThemes && {
      title: 'Selected Aspect Complaints and Praises',
      description: 'This panel summarizes recurring positive and negative language specifically for the selected aspect.',
      items: [
        {
          label: 'Selected Aspect',
          value: toTitleCase(selectedAspect),
          description: `Current result: the complaint and praise extraction is focused on ${selectedAspect}.`,
        },
        {
          label: 'Praise Mentions',
          value: selectedAspectThemes.praises?.count?.toLocaleString() || '0',
          description: 'This count reflects how many mentions of this aspect were labeled as positive in ABSA.',
        },
        {
          label: 'Complaint Mentions',
          value: selectedAspectThemes.complaints?.count?.toLocaleString() || '0',
          description: 'This count reflects how many mentions of this aspect were labeled as negative in ABSA.',
        },
      ],
    },
    actionInsights: activeDetail && {
      title: 'Quick Action Insights',
      description: 'This panel turns selected-aspect sentiment and phrase signals into immediate, plain-language actions.',
      items: [
        {
          label: 'Selected Aspect',
          value: toTitleCase(selectedAspect),
          description: `Current result: action guidance is generated for ${selectedAspect}.`,
        },
        {
          label: 'Insight Cards',
          value: actionInsights.length.toLocaleString(),
          description: 'Each card summarizes one actionable signal such as an urgent complaint, a leverageable strength, or a trend direction change.',
        },
        {
          label: 'How To Use It',
          value: 'Start with risk, then leverage strength',
          description: 'Prioritize red risk recommendations first, then use green opportunity recommendations to reinforce positive customer feedback.',
        },
      ],
    },
    aspectTrend: activeDetail && selectedAspectTrend.length > 0 && {
      title: 'Selected Aspect Trend Over Time',
      description: 'This chart tracks positive/negative share and mention volume for the selected aspect month by month.',
      items: [
        {
          label: 'Selected Aspect',
          value: toTitleCase(selectedAspect),
          description: `Current result: the trend chart is filtered to ${selectedAspect}.`,
        },
        {
          label: 'Months In View',
          value: `${filteredSelectedAspectTrend.length.toLocaleString()} of ${normalizedSelectedAspectTrend.length.toLocaleString()}`,
          description: 'This indicates how many monthly points are currently shown after the selected date range filter is applied.',
        },
        {
          label: 'How To Read It',
          value: 'Green up, red down, blue volume',
          description: 'Compare positive and negative percentage lines for tone shifts, and use the blue line to verify whether shifts occur at meaningful mention volume.',
        },
      ],
    },
    aspectExport: {
      title: 'Aspect Report Export',
      description: 'These buttons generate aspect-focused CSV or JSON reports for presentation and documentation.',
      items: [
        {
          label: 'CSV Export',
          value: 'Flat report table',
          description: 'CSV includes per-aspect counts, polarity, top complaint/praise phrases, and latest trend snapshot fields.',
        },
        {
          label: 'JSON Export',
          value: 'Full structured report',
          description: 'JSON keeps full aspect summary, phrase themes, and month-by-month aspect trends for reuse in other tools.',
        },
        {
          label: 'Generated Scope',
          value: 'Aspects only',
          description: 'This export is dedicated to aspect analysis and excludes unrelated dashboard sections to keep reports concise.',
        },
      ],
    },
    sentimentByAspect: {
      title: 'Sentiment by Aspect',
      description: 'This stacked chart compares how many positive, neutral, and negative mentions each aspect received.',
      items: [
        {
          label: 'Most Discussed Bar',
          value: `${toTitleCase(mostMentioned[0])} (${mostMentioned[1].total_mentions.toLocaleString()})`,
          description: `Current result: ${mostMentioned[0]} has the longest overall bar because it has the most total mentions.`,
        },
        {
          label: 'How To Read It',
          value: 'Longer bar = more mentions',
          description: 'The full bar length shows total discussion volume, while each color segment shows how much of that volume was positive, neutral, or negative.',
        },
        {
          label: 'Why It Matters',
          value: 'Volume + tone together',
          description: 'This chart helps beginners spot both high-volume topics and whether those topics are mostly praised or criticized.',
        },
      ],
    },
    radar: {
      title: 'Aspect Polarity Radar',
      description: 'This radar converts aspect polarity scores into a simple 0 to 100 scale so users can compare topic favorability at a glance.',
      items: [
        {
          label: 'Scale Meaning',
          value: '50 = neutral',
          description: 'Scores above 50 indicate more positive sentiment, scores below 50 indicate more negative sentiment, and 50 sits at the middle point.',
        },
        {
          label: 'Largest Positive Reach',
          value: `${toTitleCase(bestAspect[0])} (${Math.round((bestAspect[1].avg_polarity + 1) * 50)})`,
          description: `Current result: ${bestAspect[0]} pushes farthest outward because it has the most favorable polarity score.`,
        },
        {
          label: 'How To Read It',
          value: 'Larger shape = more favorable mix',
          description: 'A fuller, larger radar shape means the detected aspects are scoring more positively overall.',
        },
      ],
    },
  };

  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid grid-3">
        <HighlightCard
          label="Best Rated"
          aspect={bestAspect[0]}
          value={`+${bestAspect[1].avg_polarity.toFixed(2)}`}
          color="var(--green)"
          icon={<ArrowUpRight size={16} />}
          mentions={bestAspect[1].total_mentions}
          guideKey="best"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="aspect-guide"
        />
        <HighlightCard
          label="Worst Rated"
          aspect={worstAspect[0]}
          value={worstAspect[1].avg_polarity.toFixed(2)}
          color="var(--red)"
          icon={<ArrowDownRight size={16} />}
          mentions={worstAspect[1].total_mentions}
          guideKey="worst"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="aspect-guide"
        />
        <HighlightCard
          label="Most Mentioned"
          aspect={mostMentioned[0]}
          value={mostMentioned[1].total_mentions.toLocaleString()}
          color="var(--text-accent)"
          icon={<Target size={16} />}
          mentions={null}
          sub={`${((mostMentioned[1].total_mentions / totalMentions) * 100).toFixed(1)}% of all mentions`}
          guideKey="mentioned"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="aspect-guide"
        />
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="section-label">Aspect Report Export</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Download aspects-only summary data including trend points and top complaint/praise phrases.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => handleExportAspects('csv')}
              disabled={isExporting}
            >
              <Download size={14} /> Aspect CSV
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => handleExportAspects('json')}
              disabled={isExporting}
            >
              <Database size={14} /> Aspect JSON
            </button>
            <GuideButton
              label="Explain aspect export"
              onClick={() => setActiveGuideKey('aspectExport')}
              expanded={activeGuideKey === 'aspectExport'}
              controls="aspect-guide"
            />
          </div>
        </div>
      </div>

      {exportError && <div className="alert alert-error">{exportError}</div>}

      {hasProducts && (
        <div className="card">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Product Filter</div>
            <div className="trend-select-wrap" style={{ minWidth: 220 }}>
              <select
                className="input trend-select"
                value={selectedProduct}
                onChange={(e) => handleProductChange(e.target.value)}
                disabled={productLoading}
                aria-label="Filter aspects by product"
              >
                <option value="all">All products ({allProducts.length})</option>
                {allProducts.map((p) => (
                  <option key={p.product_id} value={p.product_id}>{truncateId(p.product_id, 60)}</option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
            {productLoading && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading product data...</span>
            )}
            {selectedProduct !== 'all' && !productLoading && productData && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {productData.total_reviews?.toLocaleString()} reviews for this product
              </span>
            )}
          </div>
        </div>
      )}

      <div className="aspect-analysis-layout">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
          <CardHeaderWithGuide
            title="All Aspects"
            icon={<Tag size={14} style={{ color: 'var(--text-muted)' }} />}
            guideKey="aspectList"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="aspect-guide"
            actions={<span className="count-badge">{aspectEntries.length}</span>}
          />
          <div style={{ flex: 1, overflow: 'auto' }}>
            {aspectEntries.map(([aspect, stats], i) => {
              const total = stats.positive_count + stats.neutral_count + stats.negative_count;
              const posW = total > 0 ? (stats.positive_count / total) * 100 : 0;
              const neuW = total > 0 ? (stats.neutral_count / total) * 100 : 0;
              const negW = total > 0 ? (stats.negative_count / total) * 100 : 0;
              const polarityColor = stats.avg_polarity >= 0 ? 'var(--green)' : 'var(--red)';
              const isSelected = selectedAspect === aspect;

  // Clicking an aspect row toggles the detail panel: selecting a different
  // aspect shows its data, clicking the already-selected aspect deselects it.
  return (
    <button
      type="button"
      key={aspect}
      onClick={() => setSelectedAspect(isSelected ? null : aspect)}
                  aria-pressed={isSelected}
                  aria-label={`Toggle details for ${aspect}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    cursor: 'pointer',
                    borderBottom: i < aspectEntries.length - 1 ? '1px solid var(--border)' : 'none',
                    background: isSelected ? 'var(--accent-muted)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                        {aspect}
                      </span>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: polarityColor }}>
                        {stats.avg_polarity > 0 ? '+' : ''}{stats.avg_polarity.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                      <div style={{ width: `${posW}%`, background: COLORS.positive }} />
                      <div style={{ width: `${neuW}%`, background: COLORS.neutral }} />
                      <div style={{ width: `${negW}%`, background: COLORS.negative }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{stats.total_mentions.toLocaleString()} mentions</span>
                      <span>{stats.positive_pct}% pos</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeDetail && (
            <div className="card" style={{ borderLeft: `3px solid ${activeDetail.avg_polarity >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>
                      Selected Aspect
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                      {selectedAspect}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                  <DetailStat label="Polarity" value={`${activeDetail.avg_polarity > 0 ? '+' : ''}${activeDetail.avg_polarity.toFixed(2)}`} color={activeDetail.avg_polarity >= 0 ? 'var(--green)' : 'var(--red)'} />
                  <DetailStat label="Total Mentions" value={activeDetail.total_mentions.toLocaleString()} />
                  <DetailStat label="Positive" value={activeDetail.positive_count.toLocaleString()} color="var(--green)" />
                  <DetailStat label="Neutral" value={activeDetail.neutral_count.toLocaleString()} color="var(--yellow)" />
                  <DetailStat label="Negative" value={activeDetail.negative_count.toLocaleString()} color="var(--red)" />
                  <div style={{ marginLeft: 'auto' }}>
                    <GuideButton
                      label={`Explain ${selectedAspect} detail`}
                      onClick={() => setActiveGuideKey('selected')}
                      expanded={activeGuideKey === 'selected'}
                      controls="aspect-guide"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedAspectThemes && (
            <div className="card">
              <CardHeaderWithGuide
                title="Selected Aspect Complaints and Praises"
                guideKey="aspectThemes"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="aspect-guide"
                actions={<span className="count-badge">{selectedAspectThemes.total_mentions?.toLocaleString() || 0}</span>}
              />
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
                  <div className="section-label" style={{ color: 'var(--green)' }}>Praises</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {(selectedAspectThemes.praises?.keywords || []).slice(0, 8).map(([word], index) => (
                      <span key={`praise-${index}`} className="tag tag-green" style={{ fontSize: 10 }}>{word}</span>
                    ))}
                  </div>
                  {(selectedAspectThemes.praises?.phrases || []).slice(0, 3).map(([phrase, count], index) => (
                    <div key={`praise-phrase-${index}`} style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>
                      "{phrase}" <span style={{ color: 'var(--text-muted)' }}>({count})</span>
                    </div>
                  ))}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
                  <div className="section-label" style={{ color: 'var(--red)' }}>Complaints</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {(selectedAspectThemes.complaints?.keywords || []).slice(0, 8).map(([word], index) => (
                      <span key={`complaint-${index}`} className="tag tag-red" style={{ fontSize: 10 }}>{word}</span>
                    ))}
                  </div>
                  {(selectedAspectThemes.complaints?.phrases || []).slice(0, 3).map(([phrase, count], index) => (
                    <div key={`complaint-phrase-${index}`} style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>
                      "{phrase}" <span style={{ color: 'var(--text-muted)' }}>({count})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeDetail && actionInsights.length > 0 && (
            <div className="card">
              <CardHeaderWithGuide
                title="Quick Action Insights"
                guideKey="actionInsights"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="aspect-guide"
                actions={<span className="count-badge">{actionInsights.length}</span>}
              />
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {actionInsights.map((insight, index) => (
                  <div
                    key={`${insight.title}-${index}`}
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: `3px solid ${insight.color}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: 10,
                      background: 'var(--bg-secondary)',
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: insight.color, marginBottom: 4 }}>
                      {insight.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {insight.message}
                    </div>
                    {insight.metric && (
                      <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        {insight.metric}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedAspectTrend.length > 0 && (
            <div className="card">
              <CardHeaderWithGuide
                title="Selected Aspect Trend Over Time"
                icon={<TrendingUp size={14} style={{ color: 'var(--text-muted)' }} />}
                guideKey="aspectTrend"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="aspect-guide"
                actions={<span className="count-badge">{filteredSelectedAspectTrend.length} months shown</span>}
              />
              <div className="card-body">
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Filter and inspect how positive and negative share changed over time for the selected aspect.
                </div>

                <div className="trend-range-grid trend-range-grid--without-product" style={{ marginBottom: 12 }}>
                  <div className="trend-range-field">
                    <label htmlFor="aspect-trend-start-month" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Start month</label>
                    <div className="trend-select-wrap">
                      <select
                        id="aspect-trend-start-month"
                        className="input trend-select"
                        value={selectedAspectTrendStartMonth}
                        onChange={handleAspectTrendStartMonthChange}
                      >
                        {aspectTrendMonthOptions.map((month) => (
                          <option key={`aspect-start-${month}`} value={month}>{formatMonthLabel(month)}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </div>

                  <div className="trend-range-field">
                    <label htmlFor="aspect-trend-end-month" style={{ fontSize: 11, color: 'var(--text-muted)' }}>End month</label>
                    <div className="trend-select-wrap">
                      <select
                        id="aspect-trend-end-month"
                        className="input trend-select"
                        value={selectedAspectTrendEndMonth}
                        onChange={handleAspectTrendEndMonthChange}
                      >
                        {aspectTrendMonthOptions.map((month) => (
                          <option key={`aspect-end-${month}`} value={month}>{formatMonthLabel(month)}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary trend-range-reset"
                    onClick={resetAspectTrendRange}
                    disabled={isDefaultAspectTrendRange}
                  >
                    Reset Range
                  </button>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Showing {formatMonthLabel(selectedAspectTrendStartMonth)} - {formatMonthLabel(selectedAspectTrendEndMonth)}
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={filteredSelectedAspectTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => {
                        if (name === 'Mentions') {
                          return [value, 'Mentions'];
                        }
                        return [`${value}%`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                    <Line yAxisId="left" type="monotone" dataKey="positive_pct" name="Positive %" stroke={COLORS.positive} strokeWidth={2} dot={false} />
                    <Line yAxisId="left" type="monotone" dataKey="negative_pct" name="Negative %" stroke={COLORS.negative} strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="total_mentions" name="Mentions" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-2">
            <div className="card">
              <CardHeaderWithGuide
                title="Sentiment by Aspect"
                guideKey="sentimentByAspect"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="aspect-guide"
              />
              <div className="card-body">
                <ResponsiveContainer width="100%" height={Math.max(280, aspectEntries.length * 48)}>
                  <BarChart data={barData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis dataKey="aspect" type="category" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                    <Bar dataKey="Positive" stackId="a" fill={COLORS.positive} />
                    <Bar dataKey="Neutral" stackId="a" fill={COLORS.neutral} />
                    <Bar dataKey="Negative" stackId="a" fill={COLORS.negative} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <CardHeaderWithGuide
                title="Aspect Polarity Radar"
                guideKey="radar"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="aspect-guide"
              />
              <div className="card-body">
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                  Each axis represents an aspect. The score ranges from 0 (most negative) to 100 (most positive), with 50 being neutral. A larger shape means more positive sentiment across aspects.
                </div>
                <ResponsiveContainer width="100%" height={Math.max(280, aspectEntries.length * 48)}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="aspect" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <Radar
                      name="Polarity Score"
                      dataKey="polarity"
                      stroke="var(--accent)"
                      fill="var(--accent)"
                      fillOpacity={0.25}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="aspect-guide"
      />
    </div>
  );
}

function HighlightCard({
  label,
  aspect,
  value,
  color,
  icon,
  mentions,
  sub,
  guideKey,
  activeGuideKey,
  onOpenGuide,
  dialogId,
}) {
  return (
    <div className="card">
      <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>
              {label}
            </div>
            <GuideButton
              label={`Explain ${label.toLowerCase()}`}
              onClick={() => onOpenGuide(guideKey)}
              expanded={activeGuideKey === guideKey}
              controls={dialogId}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-primary)' }}>{aspect}</span>
            <span className="mono" style={{ fontSize: 16, fontWeight: 800, color }}>{value}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {sub || `${mentions?.toLocaleString()} mentions`}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function extractTopPhrase(bucket) {
  const first = bucket?.phrases?.[0];
  if (!Array.isArray(first) || !first.length) {
    return null;
  }

  return {
    phrase: first[0],
    count: Number(first[1] || 0),
  };
}

function buildActionInsights({ selectedAspect, activeDetail, selectedAspectThemes, selectedAspectTrend }) {
  if (!selectedAspect || !activeDetail) {
    return [];
  }

  const insights = [];
  const topComplaint = extractTopPhrase(selectedAspectThemes?.complaints);
  const topPraise = extractTopPhrase(selectedAspectThemes?.praises);

  if (activeDetail.negative_pct >= 35) {
    insights.push({
      title: 'Priority Risk',
      color: 'var(--red)',
      message: `Negative sentiment is concentrated in ${toTitleCase(selectedAspect)}. Start issue triage for this aspect first.`,
      metric: `${activeDetail.negative_pct.toFixed(1)}% negative`,
    });
  }

  if (topComplaint?.phrase) {
    insights.push({
      title: 'Fix Recurring Complaint',
      color: 'var(--orange)',
      message: `Investigate and reduce the recurring complaint phrase "${topComplaint.phrase}" across support and product operations.`,
      metric: `${topComplaint.count.toLocaleString()} phrase hits`,
    });
  }

  if (topPraise?.phrase) {
    insights.push({
      title: 'Leverage Strength',
      color: 'var(--green)',
      message: `Preserve and promote the positive signal "${topPraise.phrase}" in marketing copy and customer education flows.`,
      metric: `${topPraise.count.toLocaleString()} phrase hits`,
    });
  }

  if (selectedAspectTrend.length >= 2) {
    const first = selectedAspectTrend[0];
    const last = selectedAspectTrend[selectedAspectTrend.length - 1];
    const firstNet = Number(first.net_sentiment ?? (first.positive_pct || 0) - (first.negative_pct || 0));
    const lastNet = Number(last.net_sentiment ?? (last.positive_pct || 0) - (last.negative_pct || 0));
    const delta = Number((lastNet - firstNet).toFixed(1));

    if (Math.abs(delta) >= 5) {
      insights.push({
        title: delta < 0 ? 'Trend Is Worsening' : 'Trend Is Improving',
        color: delta < 0 ? 'var(--red)' : 'var(--accent)',
        message: delta < 0
          ? `Net sentiment for ${toTitleCase(selectedAspect)} declined over time. Validate if a recent release or policy change is driving this drop.`
          : `Net sentiment for ${toTitleCase(selectedAspect)} improved over time. Reinforce the changes that likely drove this gain.`,
        metric: `${delta > 0 ? '+' : ''}${delta} pts net sentiment`,
      });
    }
  }

  if (!insights.length) {
    insights.push({
      title: 'Stable Signal',
      color: 'var(--text-accent)',
      message: `${toTitleCase(selectedAspect)} is relatively balanced right now. Keep monitoring complaint and praise phrases monthly for early shifts.`,
      metric: `${activeDetail.total_mentions.toLocaleString()} mentions`,
    });
  }

  return insights.slice(0, 3);
}

function formatMonthLabel(monthValue) {
  const [yearRaw, monthRaw] = String(monthValue || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthValue || 'N/A';
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function toTitleCase(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

export default AspectAnalysis;
