// _12_TrendChart.js
// ─────────────────────────────────────────────────────────────────────────────
// Renders the "Trends" tab of the dashboard.
// All time-series data was computed by the backend during the analysis run.
// This component's job is purely visual: reshape the rows for Recharts,
// derive a few helper metrics, and let the user filter by product or date.
//
// Key derived fields added to each row:
//   neutralRate      – (neutral / total) * 100 (not returned by backend directly)
//   netSentiment     – positive_pct - negative_pct (positive-vs-negative gap)
//   sentimentMomentum – positive-vs-negative gap vs the previous month
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, ChevronDown } from 'lucide-react';
import { GuideButton, CardHeaderWithGuide, InfoGuideModal } from './_8_DashboardGuide';

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  color: 'var(--text-secondary)',
};

const EMPTY_TRENDS = [];

function truncateId(text, max = 50) {
  // Keep long product IDs readable in selectors and chart labels.
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '…';
}

// formatMonthLabel converts a YYYY-MM string into a short locale-aware label
// (e.g. "Mar 2024") for X axis ticks. Invalid inputs are passed through as-is
// to avoid rendering blank axis labels if the data shape is unexpected.
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
 * TrendChart renders time-based visualizations from backend-generated trend rows.
 *
 * The fetch already happened before this component mounts. The backend returns:
 * - `trends` for overall month-level sentiment movement
 * - `product_trends` for optional product-specific month series
 *
 * This component's job is to:
 * 1) select which trend series to view
 * 2) normalize month labels and derive a few helper metrics
 * 3) feed those rows into Recharts area/line/bar charts
 *
 * The backend already groups sentiment by month. Frontend calculations here
 * only derive visualization helpers such as neutral rate, net sentiment, and
 * momentum so the chart labels remain readable.
 */
function TrendChart({ data }) {
  const [activeGuideKey, setActiveGuideKey] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState('all');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const trends = Array.isArray(data?.trends) ? data.trends : EMPTY_TRENDS;
  const productTrends = data?.product_trends || null;
  const productTrendOptions = Array.isArray(productTrends?.product_ids) ? productTrends.product_ids : EMPTY_TRENDS;

  // Switch between overall trends and one selected product's trend series
  // without making another backend request.
  const activeRawTrends = useMemo(() => {
    if (selectedProductId !== 'all') {
      const selected = productTrends?.products?.[selectedProductId];
      return Array.isArray(selected) ? selected : EMPTY_TRENDS;
    }
    return trends;
  }, [selectedProductId, productTrends, trends]);

  const hasTrendData = activeRawTrends.length > 0;

  // If the currently selected product was removed from the available list
  // (e.g. after a new upload), reset to 'all' to avoid a broken filter state.
  useEffect(() => {
    if (selectedProductId === 'all') {
      return;
    }
    if (!productTrendOptions.includes(selectedProductId)) {
      setSelectedProductId('all');
    }
  }, [selectedProductId, productTrendOptions]);

  const trendData = useMemo(
    () => activeRawTrends
      .map((t) => {
        const month = t.month.length > 7 ? t.month.substring(0, 7) : t.month;
        // Backend gives counts and positive/negative percentages. The frontend
        // derives neutral percentage and positive-vs-negative gap for charts.
        // neutralRate: how many reviews in this month were neutral (as %)
        // netSentiment: positive_pct minus negative_pct; positive = healthier
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

  const monthOptions = useMemo(
    () => Array.from(new Set(trendData.map((entry) => entry.month))),
    [trendData]
  );

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

  const filteredBaseData = trendData.filter((entry) => {
    const isAfterStart = !selectedStartMonth || entry.month >= selectedStartMonth;
    const isBeforeEnd = !selectedEndMonth || entry.month <= selectedEndMonth;
    return isAfterStart && isBeforeEnd;
  });

  // sentimentMomentum is the change in positive-vs-negative gap compared to
  // the prior month. The first point gets 0 because there is no baseline.
  const filteredTrendData = filteredBaseData.map((entry, index) => {
    const previousNet = index > 0 ? filteredBaseData[index - 1].netSentiment : null;
    return {
      ...entry,
      sentimentMomentum: previousNet === null ? 0 : Math.round((entry.netSentiment - previousNet) * 10) / 10,
    };
  });

  const handleStartMonthChange = (event) => {
    const nextStart = event.target.value;
    setStartMonth(nextStart);
    // Guard: prevent the start month from going past the end month.
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

  // Pre-compute the summary stats used by the top stat cards and the guide modal.
  // These run only when filteredTrendData changes (memoized implicitly by const
  // declarations inside render; useMemo would be needed for large arrays).
  const latest = filteredTrendData[filteredTrendData.length - 1];
  const previous = filteredTrendData.length > 1 ? filteredTrendData[filteredTrendData.length - 2] : null;
  const strongestMonth = filteredTrendData.reduce((best, current) => (current.netSentiment > best.netSentiment ? current : best), filteredTrendData[0]);
  const highestNegativeMonth = filteredTrendData.reduce((worst, current) => (current.negativeRate > worst.negativeRate ? current : worst), filteredTrendData[0]);
  const peakVolumeMonth = filteredTrendData.reduce((peak, current) => (current.total > peak.total ? current : peak), filteredTrendData[0]);

  const isDefaultRange = selectedStartMonth === defaultStartMonth && selectedEndMonth === defaultEndMonth;
  const visibleMonthsLabel = `${formatMonthLabel(selectedStartMonth)} - ${formatMonthLabel(selectedEndMonth)}`;

  // Determine the sentiment direction by comparing the latest month's net
  // sentiment with the one before it. Used in the stat card and guide text.
  const latestDirection = previous
    ? latest.netSentiment > (previous.netSentiment || 0)
      ? 'improving'
      : latest.netSentiment < (previous.netSentiment || 0)
        ? 'softening'
      : 'steady'
    : 'baseline';

  // Every trend info button resolves to one of these guide entries.
  // The descriptions are generated from the current filtered trend data, so
  // the modal explains the exact months and values the user is looking at.
  const guideSections = {
    latest: {
      title: 'Latest Month',
      description: 'This card summarizes the most recent month available in the dataset.',
      items: [
        {
          label: 'Current Month',
          value: latest.month,
          description: `Current result: ${latest.month} is the latest time bucket represented in the dataset.`,
        },
        {
          label: 'Positive vs Negative',
          value: `${latest.netSentiment > 0 ? '+' : ''}${latest.netSentiment} pts`,
          description: latest.netSentiment >= 0
            ? 'Current result: positive reviews outweigh negative reviews in the latest month.'
            : 'Current result: negative reviews outweigh positive reviews in the latest month.',
        },
        {
          label: 'Change From Previous Month',
          value: previous ? `${latestDirection} (${latest.sentimentMomentum > 0 ? '+' : ''}${latest.sentimentMomentum} pts)` : 'No prior month',
          description: previous
            ? 'This compares the latest month with the month immediately before it.'
            : 'A previous month is required before the dashboard can calculate month-to-month change.',
        },
      ],
    },
    strongest: {
      title: 'Best Month',
      description: 'This card highlights the month where positive reviews most clearly outweighed negative reviews.',
      items: [
        {
          label: 'Best Month',
          value: strongestMonth.month,
          description: `Current result: ${strongestMonth.month} has the largest positive gap in the current time series.`,
        },
        {
          label: 'Positive vs Negative',
          value: `${strongestMonth.netSentiment > 0 ? '+' : ''}${strongestMonth.netSentiment} pts`,
          description: 'This is the difference between positive review share and negative review share.',
        },
        {
          label: 'Positive Share',
          value: `${strongestMonth.positiveRate}%`,
          description: 'This is the share of reviews in that month that were classified as positive.',
        },
      ],
    },
    risk: {
      title: 'Month With Most Complaints',
      description: 'This card points to the month with the highest percentage of negative reviews.',
      items: [
        {
          label: 'Complaint Month',
          value: highestNegativeMonth.month,
          description: `Current result: ${highestNegativeMonth.month} has the largest negative share in the series.`,
        },
        {
          label: 'Negative Share',
          value: `${highestNegativeMonth.negativeRate}%`,
          description: 'This tells beginners what portion of that month’s reviews were classified as negative.',
        },
        {
          label: 'Why It Matters',
          value: 'Potential issue spike',
          description: 'A sudden peak in negative share can signal a release issue, shipping problem, service interruption, or other temporary pain point.',
        },
      ],
    },
    peak: {
      title: 'Month With Most Reviews',
      description: 'This card shows when the dataset had the most review activity.',
      items: [
        {
          label: 'Most Reviews',
          value: peakVolumeMonth.month,
          description: `Current result: ${peakVolumeMonth.month} contains the highest number of reviews in the time series.`,
        },
        {
          label: 'Review Count',
          value: peakVolumeMonth.total.toLocaleString(),
          description: 'This is the total number of reviews recorded in that month.',
        },
        {
          label: 'Why It Matters',
          value: 'Traffic context',
          description: 'Volume spikes help users separate a true sentiment change from a period that simply had more activity and therefore more visible feedback.',
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
          description: 'Each colored area shows how many reviews of that sentiment occurred in the month. The total stacked height equals total monthly review volume.',
        },
        {
          label: 'Current End Point',
          value: `${latest.month}: ${latest.total.toLocaleString()} reviews`,
          description: 'This tells users what the trend line ends on in the latest month of data.',
        },
        {
          label: 'Why It Matters',
          value: 'Absolute volume',
          description: 'This chart is useful when users want to see actual counts instead of percentages, especially during volume spikes.',
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
          description: 'Each line shows what percentage of that month’s reviews belonged to one sentiment class.',
        },
        {
          label: 'Latest Share Mix',
          value: `${latest.positiveRate}% / ${latest.neutralRate}% / ${latest.negativeRate}%`,
          description: 'Read these in order as positive, neutral, and negative share in the latest month.',
        },
        {
          label: 'Why It Matters',
          value: 'Normalized comparison',
          description: 'Percentages let beginners compare months fairly even when the number of reviews changes from month to month.',
        },
      ],
    },
    volume: {
      title: 'Review Volume by Month',
      description: 'This chart isolates total review count by month so users can see seasonality and activity spikes.',
      items: [
        {
          label: 'Peak Month',
          value: `${peakVolumeMonth.month} (${peakVolumeMonth.total.toLocaleString()})`,
          description: 'Current result: this is the busiest month in the time series.',
        },
        {
          label: 'Latest Volume',
          value: latest.total.toLocaleString(),
          description: `Current result: ${latest.total.toLocaleString()} reviews were recorded in the latest month.`,
        },
        {
          label: 'Why It Matters',
          value: 'Activity baseline',
          description: 'Volume helps explain whether a visible sentiment swing came from a real sentiment shift or just a surge in review traffic.',
        },
      ],
    },
    net: {
      title: 'Good Reviews Minus Bad Reviews',
      description: 'This chart compares the good-review share and bad-review share for each month side by side.',
      items: [
        {
          label: 'How To Read It',
          value: 'Green bar vs red bar',
          description: 'The green bar is the monthly positive-review share. The red bar is the monthly negative-review share. A bigger green bar means good reviews are ahead.',
        },
        {
          label: 'Best Month',
          value: `${strongestMonth.month} (${strongestMonth.positiveRate}% positive)`,
          description: 'This is the month where positive reviews most clearly outpaced negative reviews.',
        },
        {
          label: 'Latest Month',
          value: `${latest.positiveRate}% positive / ${latest.negativeRate}% negative`,
          description: 'This shows the current good-review and bad-review shares without requiring users to interpret a calculated score.',
        },
      ],
    },
  };

  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      <div className="grid grid-2">
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
                <Area type="monotone" dataKey="positive" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.5} name="Positive" />
                <Area type="monotone" dataKey="neutral" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.45} name="Neutral" />
                <Area type="monotone" dataKey="negative" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.45} name="Negative" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

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

      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="trend-guide"
      />
    </div>
  );
}

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
