// _12_TrendChart.js
// ─────────────────────────────────────────────────────────────────────────────
// [Trends Tab] Visualization of Month-over-Month Sentiment and Review Volume
//
// This React component handles the "Trends" tab in our review dashboard.
//
// Background context and design choices:
// 1. Where does the data come from?
//    - The backend does all the heavy lifting (date parsing, grouping, and
//      counting positive/neutral/negative reviews per month) beforehand during the
//      offline pipeline. The final outputs are structured in the main response:
//      - `trends` contains overall month-by-month sentiment aggregates.
//      - `product_trends` contains optional product-specific month-by-month arrays.
// 2. What is this component's role?
//    - It is purely visual and interactive. It does not query the database or
//      re-run sentiment models. It reads the precomputed data, lets users
//      apply filters (by product and custom start/end months) client-side,
//      and maps the filtered series to interactive Recharts graphs.
// 3. Derived Metrics calculated on-the-fly:
//    - `neutralRate`: Calculates what percentage of reviews each month were
//      neutral. The backend outputs positive/negative percentages, so the frontend
//      derives this dynamically as: (neutral / total) * 100.
//    - `netSentiment`: Measures the positive-vs-negative gap (Positive % - Negative %).
//      A positive gap indicates healthy sentiment, while a negative gap suggests
//      buyer complaints outpace praise.
//    - `sentimentMomentum`: Computes month-over-month change in `netSentiment`
//      to show whether the sentiment trajectory is improving or softening.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, ChevronDown } from 'lucide-react';
import { GuideButton, CardHeaderWithGuide, InfoGuideModal } from './_8_DashboardGuide';

// Reusable styling object for Recharts tooltips.
// Uses CSS custom properties (variables) to maintain light/dark theme compatibility.
const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  color: 'var(--text-secondary)',
};

const EMPTY_TRENDS = [];

// Helper function to truncate long product identifiers or names in dropdowns and labels.
// This prevents extremely long product keys from breaking the CSS grid or spilling
// over layout boundaries.
function truncateId(text, max = 50) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '…';
}

// Helper function to convert a standard Year-Month string (e.g. "2026-04")
// into a locale-aware formatted string (e.g. "Apr 2026").
// It handles input validation gracefully, uses Date.UTC to avoid local timezone
// shift errors, and falls back to the original string if parsing fails to avoid blank axis labels.
function formatMonthLabel(monthValue) {
  const [yearRaw, monthRaw] = String(monthValue).split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return monthValue;
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * TrendChart Component
 *
 * Visualizes time-based sentiment and volume movements from precomputed backend rows.
 * Handles client-side product filtering, custom date range filtering, and computes
 * trend highlights (Best Month, Worst Month, Volume Peaks, Latest Month) along with
 * 4 key visualizations (Stacked Review Counts, Good/Neutral/Bad Line Share,
 * Overall Review Volume, and Side-by-Side Good vs. Bad review comparison).
 */
function TrendChart({ data }) {
  // --- STATE DEFINITIONS ---
  // activeGuideKey: tracks which visual card or chart explanation is open in the interactive modal.
  // When null, the modal is closed. When set to a string (like 'latest' or 'mix'), it displays that specific help text.
  const [activeGuideKey, setActiveGuideKey] = useState(null);

  // selectedProductId: identifies which product we are analyzing.
  // Defaults to 'all' for dataset-wide trends. Selecting a specific product filters the charts on-the-fly.
  const [selectedProductId, setSelectedProductId] = useState('all');

  // startMonth / endMonth: hold the active boundary selections for the date range filter.
  // Stored as "YYYY-MM" strings (e.g., "2026-01") matching the backend data buckets.
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');

  // Extract base series arrays provided by our dashboard analysis loader.
  const trends = Array.isArray(data?.trends) ? data.trends : EMPTY_TRENDS;
  const productTrends = data?.product_trends || null;
  const productTrendOptions = Array.isArray(productTrends?.product_ids) ? productTrends.product_ids : EMPTY_TRENDS;

  // --- MEMOIZED DATA SELECTORS ---
  // activeRawTrends: resolves whether to display the overall time series or the series for a specific product.
  // By using useMemo, we prevent re-extracting this array when unrelated states change (such as opening the guide modal).
  const activeRawTrends = useMemo(() => {
    if (selectedProductId !== 'all') {
      const selected = productTrends?.products?.[selectedProductId];
      return Array.isArray(selected) ? selected : EMPTY_TRENDS;
    }
    return trends;
  }, [selectedProductId, productTrends, trends]);

  const hasTrendData = activeRawTrends.length > 0;

  // --- SIDE EFFECTS / CLEANUP ---
  // Reset selectedProductId to 'all' if the user uploads a new dataset where the previously
  // selected product ID no longer exists. This keeps our filtering state synchronized and error-free.
  useEffect(() => {
    if (selectedProductId === 'all') {
      return;
    }
    if (!productTrendOptions.includes(selectedProductId)) {
      setSelectedProductId('all');
    }
  }, [selectedProductId, productTrendOptions]);

  // --- DATA SHAPING & METRICS DERIVATION ---
  // trendData: maps and shapes raw backend rows for our charts.
  // We perform two key operations here:
  // 1. We standardize the 'month' field format to YYYY-MM.
  // 2. We calculate visual helpers that the backend doesn't output directly:
  //    - neutralRate: (neutral reviews count / total reviews) * 100, rounded to 1 decimal place.
  //    - netSentiment: positiveRate minus negativeRate. This is a crucial business KPI; positive values
  //      show that praise dominates, while negative values warn that complaints outweigh satisfaction.
  // 3. We sort chronologically to ensure lines and areas draw left-to-right over time.
  const trendData = useMemo(
    () => activeRawTrends
      .map((t) => {
        const month = t.month.length > 7 ? t.month.substring(0, 7) : t.month;
        const neutralRate = Math.round((t.neutral / t.total) * 100 * 10) / 10;
        const netSentiment = Math.round((t.positive_pct - t.negative_pct) * 10) / 10;

        return {
          ...t,
          month,
          positiveRate: t.positive_pct,
          negativeRate: t.negative_pct,
          neutralRate,
          netSentiment,
        };
      })
      .sort((a, b) => String(a.month).localeCompare(String(b.month))),
    [activeRawTrends]
  );

  // monthOptions: extracts unique sorted month buckets so our dropdowns can display valid timeline values.
  const monthOptions = useMemo(
    () => Array.from(new Set(trendData.map((entry) => entry.month))),
    [trendData]
  );

  // Synchronize start/end date filters when a new timeline is loaded.
  // By default, we select the earliest month as the start point and the latest month as the end point.
  useEffect(() => {
    if (monthOptions.length === 0) {
      setStartMonth('');
      setEndMonth('');
      return;
    }
    setStartMonth(monthOptions[0]);
    setEndMonth(monthOptions[monthOptions.length - 1]);
  }, [monthOptions]);

  const defaultStartMonth = monthOptions[0] || '';
  const defaultEndMonth = monthOptions[monthOptions.length - 1] || '';
  const selectedStartMonth = monthOptions.includes(startMonth) ? startMonth : defaultStartMonth;
  const selectedEndMonth = monthOptions.includes(endMonth) ? endMonth : defaultEndMonth;

  // Filter our data array to only include records that fall within the selected start and end months.
  const filteredBaseData = trendData.filter((entry) => {
    const isAfterStart = !selectedStartMonth || entry.month >= selectedStartMonth;
    const isBeforeEnd = !selectedEndMonth || entry.month <= selectedEndMonth;
    return isAfterStart && isBeforeEnd;
  });

  // --- MOMENTUM CALCULATIONS ---
  // filteredTrendData: adds a 'sentimentMomentum' field to each row in our visual set.
  // sentimentMomentum is the difference between this month's netSentiment and the previous month's netSentiment.
  // It answers: "Are reviews improving or getting worse compared to last month?"
  // Note: the first month in the filtered set has no baseline, so it defaults to 0.
  const filteredTrendData = filteredBaseData.map((entry, index) => {
    const previousNet = index > 0 ? filteredBaseData[index - 1].netSentiment : null;
    return {
      ...entry,
      sentimentMomentum: previousNet === null ? 0 : Math.round((entry.netSentiment - previousNet) * 10) / 10,
    };
  });

  // --- FILTER CHANGE HANDLERS ---
  // handleStartMonthChange: updates the start month boundary.
  // It guards the input: if the user selects a start month that is chronologically after the current
  // end month, it automatically nudges the end month forward to match the start month, preventing a broken filter state.
  const handleStartMonthChange = (event) => {
    const nextStart = event.target.value;
    setStartMonth(nextStart);
    if (selectedEndMonth && nextStart > selectedEndMonth) {
      setEndMonth(nextStart);
    }
  };

  const handleEndMonthChange = (event) => {
    const nextEnd = event.target.value;
    setEndMonth(nextEnd);
    // Guard: prevent the end month from going before the start month.
    if (selectedStartMonth && nextEnd < selectedStartMonth) {
      setStartMonth(nextEnd);
    }
  };

  const resetDateRange = () => {
    setStartMonth(defaultStartMonth);
    setEndMonth(defaultEndMonth);
  };

  // Limit X-axis tick density: show a tick every ~12th data point when the
  // series is long so labels don't overlap at narrow container widths.
  const axisStyle = { fontSize: 10, fill: 'var(--text-muted)' };
  const labelInterval = Math.max(0, Math.floor(filteredTrendData.length / 12));

  const hasProductFilter = productTrendOptions.length > 0;

  if (!hasTrendData) {
    return (
      <div className="state state-empty">
        <h3>{selectedProductId === 'all' ? 'No date/time data available' : 'No trend data for selected product'}</h3>
        <p>
          {selectedProductId === 'all'
            ? 'Trend analysis requires a date column in the dataset.'
            : 'Try selecting a different product or switch back to all products.'}
        </p>
      </div>
    );
  }

  if (filteredTrendData.length === 0) {
    return (
      <div className="state state-empty">
        <h3>No data in selected date range</h3>
        <p>Adjust the trend date range to include at least one available month.</p>
      </div>
    );
  }

  // --- HIGHLIGHT STATISTICS PRE-COMPUTATION ---
  // We extract summary statistics from our active filtered series to populate the four top highlight cards.
  // Statically computed during rendering. In huge datasets, these could be memoized, but for standard
  // user dashboards, this inline computation is lightweight and ensures data stays perfectly in sync.

  // latest: gets the last month in our filtered array (the most recent period).
  const latest = filteredTrendData[filteredTrendData.length - 1];

  // previous: gets the second-to-last month to calculate month-over-month trajectory changes.
  const previous = filteredTrendData.length > 1 ? filteredTrendData[filteredTrendData.length - 2] : null;

  // strongestMonth: finds the month with the highest netSentiment (the biggest positive-minus-negative gap).
  const strongestMonth = filteredTrendData.reduce((best, current) => (current.netSentiment > best.netSentiment ? current : best), filteredTrendData[0]);

  // highestNegativeMonth: finds the month with the highest negative review percentage (peak complaints rate).
  const highestNegativeMonth = filteredTrendData.reduce((worst, current) => (current.negativeRate > worst.negativeRate ? current : worst), filteredTrendData[0]);

  // peakVolumeMonth: finds the month with the maximum review count (highest density of customer feedback).
  const peakVolumeMonth = filteredTrendData.reduce((peak, current) => (current.total > peak.total ? current : peak), filteredTrendData[0]);

  const isDefaultRange = selectedStartMonth === defaultStartMonth && selectedEndMonth === defaultEndMonth;
  const visibleMonthsLabel = `${formatMonthLabel(selectedStartMonth)} - ${formatMonthLabel(selectedEndMonth)}`;

  // Determine the trend trajectory by comparing the latest month's net sentiment with the prior month.
  // - "improving": net sentiment is higher than the previous month's.
  // - "softening": net sentiment has dropped.
  // - "steady": net sentiment remains identical.
  // - "baseline": if there is no previous month available for comparison.
  const latestDirection = previous
    ? latest.netSentiment > (previous.netSentiment || 0)
      ? 'improving'
      : latest.netSentiment < (previous.netSentiment || 0)
        ? 'softening'
      : 'steady'
    : 'baseline';

  // --- DYNAMIC TUTORIAL / GUIDE SECTIONS ---
  // Every "Explain" button in the dashboard links to one of these sections.
  // The descriptions are generated dynamically using values from the active dataset.
  // This helps beginners interpret the charts, explaining the exact months and scores they see.
  const guideSections = {
    latest: {
      title: 'Latest Month',
      description: 'This card summarizes customer feedback from the most recent month recorded in the dataset.',
      items: [
        {
          label: 'Current Month',
          value: latest.month,
          description: `Current result: ${latest.month} is the latest month represented in your current filter view.`,
        },
        {
          label: 'Positive vs Negative',
          value: `${latest.netSentiment > 0 ? '+' : ''}${latest.netSentiment} pts`,
          description: latest.netSentiment >= 0
            ? 'Current result: positive reviews exceed negative reviews in the latest month.'
            : 'Current result: negative reviews exceed positive reviews in the latest month, indicating high complaints.',
        },
        {
          label: 'Change From Previous Month',
          value: previous ? `${latestDirection} (${latest.sentimentMomentum > 0 ? '+' : ''}${latest.sentimentMomentum} pts)` : 'No prior month',
          description: previous
            ? 'This shows the month-over-month shift in net sentiment.'
            : 'We need at least two months of trend data to compute a trajectory change.',
        },
      ],
    },
    strongest: {
      title: 'Best Month',
      description: 'Highlights the month where customer satisfaction was highest (widest positive-vs-negative sentiment gap).',
      items: [
        {
          label: 'Best Month',
          value: strongestMonth.month,
          description: `Current result: ${strongestMonth.month} is the highest-rated month in this series.`,
        },
        {
          label: 'Positive vs Negative',
          value: `${strongestMonth.netSentiment > 0 ? '+' : ''}${strongestMonth.netSentiment} pts`,
          description: 'This is the gap between positive percentage and negative percentage.',
        },
        {
          label: 'Positive Share',
          value: `${strongestMonth.positiveRate}%`,
          description: 'This is the percentage of reviews that were classified as positive during this peak month.',
        },
      ],
    },
    risk: {
      title: 'Month With Most Complaints',
      description: 'Identifies the month where the percentage of negative reviews reached its highest level.',
      items: [
        {
          label: 'Complaint Month',
          value: highestNegativeMonth.month,
          description: `Current result: ${highestNegativeMonth.month} contains the highest ratio of complaints in this series.`,
        },
        {
          label: 'Negative Share',
          value: `${highestNegativeMonth.negativeRate}%`,
          description: 'What portion of reviews in that month were classified as negative.',
        },
        {
          label: 'Why It Matters',
          value: 'Potential quality spikes',
          description: 'A sudden peak in negative reviews helps you identify shipping delays, defective batches, or website issues.',
        },
      ],
    },
    peak: {
      title: 'Month With Most Reviews',
      description: 'Highlights the month with the highest volume of review activity.',
      items: [
        {
          label: 'Most Reviews',
          value: peakVolumeMonth.month,
          description: `Current result: ${peakVolumeMonth.month} was the busiest month for reviews in the time series.`,
        },
        {
          label: 'Review Count',
          value: peakVolumeMonth.total.toLocaleString(),
          description: 'The absolute number of reviews submitted in that month.',
        },
        {
          label: 'Why It Matters',
          value: 'Traffic context',
          description: 'High volume gives you stronger statistical confidence in the sentiment metrics than a month with only a few reviews.',
        },
      ],
    },
    mix: {
      title: 'Monthly Review Counts',
      description: 'This stacked area chart shows how many positive, neutral, and negative reviews appeared in each month.',
      items: [
        {
          label: 'How To Read It',
          value: 'Stacked counts by month',
          description: 'The height of each color band represents review counts. The total height of the stack equals total reviews that month.',
        },
        {
          label: 'Current End Point',
          value: `${latest.month}: ${latest.total.toLocaleString()} reviews`,
          description: 'This represents the total review counts in the most recent month.',
        },
        {
          label: 'Why It Matters',
          value: 'Absolute volume tracking',
          description: 'Ideal for tracking raw growth in review activity, allowing you to see if sentiment swings coincide with product sales spikes.',
        },
      ],
    },
    share: {
      title: 'Monthly Good, Neutral, and Bad Share',
      description: 'This line chart compares the monthly percentage share of positive, neutral, and negative reviews.',
      items: [
        {
          label: 'How To Read It',
          value: 'Lines show monthly percentage',
          description: 'Three lines trace positive %, negative %, and neutral % across months, normalizing variations in monthly review volume.',
        },
        {
          label: 'Latest Share Mix',
          value: `${latest.positiveRate}% / ${latest.neutralRate}% / ${latest.negativeRate}%`,
          description: 'Latest percentages shown as: Positive / Neutral / Negative.',
        },
        {
          label: 'Why It Matters',
          value: 'Normalized comparison',
          description: 'Allows you to compare customer satisfaction levels across months, even if one month has 10 reviews and another has 1,000.',
        },
      ],
    },
    volume: {
      title: 'Review Volume by Month',
      description: 'Isolates total review count by month to highlight purchase seasonality or promotion impacts.',
      items: [
        {
          label: 'Peak Month',
          value: `${peakVolumeMonth.month} (${peakVolumeMonth.total.toLocaleString()})`,
          description: 'The month that saw the highest overall review activity.',
        },
        {
          label: 'Latest Volume',
          value: latest.total.toLocaleString(),
          description: `Reviews recorded during the most recent month.`,
        },
        {
          label: 'Why It Matters',
          value: 'Activity baseline',
          description: 'Helps determine whether a sentiment swing represents a widespread issue or just a minor fluctuation from a quiet month.',
        },
      ],
    },
    net: {
      title: 'Good Reviews Minus Bad Reviews',
      description: 'This chart compares the monthly positive-review share and negative-review share side by side.',
      items: [
        {
          label: 'How To Read It',
          value: 'Green bar vs red bar',
          description: 'Green bars show positive review share. Red bars show negative review share. When green is taller than red, good feedback dominates.',
        },
        {
          label: 'Best Month',
          value: `${strongestMonth.month} (${strongestMonth.positiveRate}% positive)`,
          description: 'The month where positive reviews outpaced negative reviews by the widest margin.',
        },
        {
          label: 'Latest Month',
          value: `${latest.positiveRate}% positive / ${latest.negativeRate}% negative`,
          description: 'Shows the latest good-vs-bad review share side by side.',
        },
      ],
    },
  };

  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 1: TREND FILTERS
          Lets users select product specific trend lists or slice by start/end month.
          ─────────────────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Trend Filters</div>
            <div className="chip">{filteredTrendData.length} months shown</div>
          </div>

          <div
            className={`trend-range-grid ${hasProductFilter ? 'trend-range-grid--with-product' : 'trend-range-grid--without-product'}`}
          >
            {hasProductFilter && (
              <div className="trend-range-field">
                <label htmlFor="trend-product-filter" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Product</label>
                <div className="trend-select-wrap">
                  <select
                    id="trend-product-filter"
                    className="input trend-select"
                    value={selectedProductId}
                    onChange={(event) => setSelectedProductId(event.target.value)}
                  >
                    <option value="all">All products</option>
                    {productTrendOptions.map((productId) => (
                      <option key={`product-${productId}`} value={productId}>{truncateId(productId, 60)}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </div>
              </div>
            )}

            <div className="trend-range-field">
              <label htmlFor="trend-start-month" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Start month</label>
              <div className="trend-select-wrap">
                <select
                  id="trend-start-month"
                  className="input trend-select"
                  value={selectedStartMonth}
                  onChange={handleStartMonthChange}
                >
                  {monthOptions.map((month) => (
                    <option key={`start-${month}`} value={month}>{formatMonthLabel(month)}</option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </div>
            </div>

            <div className="trend-range-field">
              <label htmlFor="trend-end-month" style={{ fontSize: 11, color: 'var(--text-muted)' }}>End month</label>
              <div className="trend-select-wrap">
                <select
                  id="trend-end-month"
                  className="input trend-select"
                  value={selectedEndMonth}
                  onChange={handleEndMonthChange}
                >
                  {monthOptions.map((month) => (
                    <option key={`end-${month}`} value={month}>{formatMonthLabel(month)}</option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary trend-range-reset"
              onClick={resetDateRange}
              disabled={isDefaultRange}
            >
              Reset Range
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {selectedProductId === 'all'
              ? `Showing trends from ${visibleMonthsLabel}.`
              : `Showing ${selectedProductId} trends from ${visibleMonthsLabel}.`}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 2: TREND INSIGHT HIGHLIGHT CARDS
          Displays four summaries: latest month, best month, most complaints, most reviews.
          ─────────────────────────────────────────────────────────────────────── */}
      <div className="trend-insight-grid">
        <TrendInsightCard
          title="Latest Month"
          value={formatMonthLabel(latest.month)}
          sub={`${latest.positiveRate}% positive, ${latest.negativeRate}% negative`}
          accent="var(--text-accent)"
          icon={<TrendingUp size={16} />}
          guideKey="latest"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="trend-guide"
        />
        <TrendInsightCard
          title="Best Month"
          value={formatMonthLabel(strongestMonth.month)}
          sub={`${strongestMonth.netSentiment > 0 ? '+' : ''}${strongestMonth.netSentiment} more positive`}
          accent="var(--green)"
          icon={<TrendingUp size={16} />}
          guideKey="strongest"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="trend-guide"
        />
        <TrendInsightCard
          title="Most Complaints"
          value={formatMonthLabel(highestNegativeMonth.month)}
          sub={`${highestNegativeMonth.negativeRate}% negative reviews`}
          accent="var(--red)"
          icon={<TrendingDown size={16} />}
          guideKey="risk"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="trend-guide"
        />
        <TrendInsightCard
          title="Most Reviews"
          value={formatMonthLabel(peakVolumeMonth.month)}
          sub={`${peakVolumeMonth.total.toLocaleString()} reviews`}
          accent="var(--accent)"
          icon={<BarChart3 size={16} />}
          guideKey="peak"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="trend-guide"
        />
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 3: FOUR KEY RECHARTS VISUALIZATIONS
          Split into a 2x2 responsive CSS grid layout.
          ─────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-2">

        {/* CHART 1: Monthly Review Counts (Stacked AreaChart of absolute volumes) */}
        <div className="card">
          <CardHeaderWithGuide
            title="Monthly Review Counts"
            icon={<TrendingUp size={14} style={{ color: 'var(--accent)' }} />}
            guideKey="mix"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="trend-guide"
          />
          <div className="card-body">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={filteredTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={axisStyle}
                  interval={labelInterval}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => `Period: ${label}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* positive, neutral, negative counts are stacked together using the same stackId. */}
                <Area type="monotone" dataKey="positive" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.5} name="Positive" />
                <Area type="monotone" dataKey="neutral" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.45} name="Neutral" />
                <Area type="monotone" dataKey="negative" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.45} name="Negative" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Monthly Good, Neutral, and Bad Share (Normalized LineChart of rates) */}
        <div className="card">
          <CardHeaderWithGuide
            title="Monthly Good, Neutral, and Bad Share"
            guideKey="share"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="trend-guide"
          />
          <div className="card-body">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={filteredTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={axisStyle}
                  interval={labelInterval}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={axisStyle} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="positiveRate" stroke="#22c55e" strokeWidth={2} dot={false} name="Positive %" />
                <Line type="monotone" dataKey="negativeRate" stroke="#ef4444" strokeWidth={2} dot={false} name="Negative %" />
                <Line type="monotone" dataKey="neutralRate" stroke="#eab308" strokeWidth={2} dot={false} name="Neutral %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 3: Review Volume by Month (AreaChart showing total feedback density) */}
        <div className="card">
          <CardHeaderWithGuide
            title="Review Volume by Month"
            guideKey="volume"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="trend-guide"
          />
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={filteredTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={axisStyle}
                  interval={labelInterval}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="total" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} name="Total Reviews" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 4: Good Reviews Minus Bad Reviews (BarChart comparing positive and negative rates side-by-side) */}
        <div className="card">
          <CardHeaderWithGuide
            title="Good Reviews Minus Bad Reviews"
            guideKey="net"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="trend-guide"
          />
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filteredTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tick={axisStyle}
                  interval={labelInterval}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={axisStyle} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [`${value}%`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="positiveRate" name="Good Reviews %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="negativeRate" name="Bad Reviews %" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* InfoGuideModal: interactive overlay triggered by GuideButtons */}
      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="trend-guide"
      />
    </div>
  );
}

/**
 * TrendInsightCard Component
 *
 * Child component that renders a single summary statistic card.
 * Integrates with the visual guide modal via a GuideButton.
 */
function TrendInsightCard({
  title,
  value,
  sub,
  accent,
  icon,
  guideKey,
  activeGuideKey,
  onOpenGuide,
  dialogId,
}) {
  return (
    <div className="card trend-insight-card">
      <div className="trend-insight-body">
        <div className="trend-insight-icon" style={{ color: accent }}>
          {icon}
        </div>
        <div className="trend-insight-copy">
          <div className="trend-insight-top">
            <div className="trend-insight-title">
              {title}
            </div>
            <GuideButton
              label={`Explain ${title.toLowerCase()}`}
              onClick={() => onOpenGuide(guideKey)}
              expanded={activeGuideKey === guideKey}
              controls={dialogId}
            />
          </div>
          <div className="mono trend-insight-value" style={{ color: accent }}>{value}</div>
          <div className="trend-insight-sub">{sub}</div>
        </div>
      </div>
    </div>
  );
}

export default TrendChart;
