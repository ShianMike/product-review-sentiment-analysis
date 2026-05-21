// _9_SentimentOverview.js
// ─────────────────────────────────────────────────────────────────────────────
// Renders the "Overview" tab of the dashboard.
// This file does NOT call the backend. The parent (Dashboard/App) already
// completed the analysis fetch and passes the full result as `data`.
//
// Responsibilities:
//   - Transform backend response fields into chart-ready shapes
//   - Display sentiment counts, a pie chart, a ratings bar chart or fallback,
//     a product-level comparison table, and a top-aspects/keywords preview
//   - Manage the open/close state of the InfoGuideModal
//   - Allow the user to focus on a single product via a dropdown filter
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, MessageSquare, Tag, Zap, BarChart3, ChevronDown } from 'lucide-react';
import { GuideButton, CardHeaderWithGuide, InfoGuideModal } from './_8_DashboardGuide';

const COLORS = {
  positive: '#22c55e',
  neutral: '#eab308',
  negative: '#ef4444',
};

function truncateId(text, max = 50) {
  // Shorten long product IDs so they fit in dropdowns and cards.
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function productDistribution(product) {
  // Normalize one product row into the same positive/neutral/negative shape as
  // the overall sentiment distribution.
  if (!product) return null;
  if (product.sentiment_summary) return product.sentiment_summary;

  const total = product.total_reviews || product.review_count || 0;
  const bucket = (count, percentage) => ({
    count: count || 0,
    percentage: typeof percentage === 'number'
      ? percentage
      : total > 0
        ? Math.round(((count || 0) / total) * 1000) / 10
        : 0,
  });

  return {
    positive: bucket(product.positive_count, product.positive_pct),
    neutral: bucket(product.neutral_count, product.neutral_pct),
    negative: bucket(product.negative_count, product.negative_pct),
  };
}

function defaultProductInsight(product) {
  // Build a plain-English insight when the backend did not provide one.
  if (!product) return '';
  const negativePct = product.negative_pct || 0;
  const positivePct = product.positive_pct || 0;
  const neutralPct = product.neutral_pct || 0;
  const reviews = product.total_reviews || product.review_count || 0;

  if (negativePct >= 35) {
    return `${product.product_id} has a high complaint share: ${negativePct}% of ${reviews.toLocaleString()} reviews are negative.`;
  }
  if (positivePct >= 65 && negativePct <= 15) {
    return `${product.product_id} is performing well with ${positivePct}% positive reviews.`;
  }
  if (neutralPct >= 30) {
    return `${product.product_id} has many neutral reviews, so sellers should clarify product expectations.`;
  }
  return `${product.product_id} has a stable sentiment mix; keep monitoring for new complaints.`;
}

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  color: 'var(--text-secondary)',
};

/**
 * Overview section for the dashboard.
 *
 * This component does not fetch data from the backend. It receives the completed
 * analysis payload from Dashboard/App and converts a few response objects into
 * shapes that Recharts can render directly.
 *
 * Main transformations:
 * - sentiment_distribution -> pieData
 * - rating_distribution -> ratingData
 * - aspect_summary -> topAspects preview cards
 * - theme_summary/product_summary -> supporting insight cards
 *
 * This component does not recompute sentiment. It only visualizes the model
 * outputs and product summaries already prepared by the backend pipeline.
 */
function SentimentOverview({ data }) {
  const [activeGuideKey, setActiveGuideKey] = useState(null);
  // selectedProductFocus holds the product_id string chosen in the dropdown,
  // or 'all' meaning no filter is active.
  const [selectedProductFocus, setSelectedProductFocus] = useState('all');
  const {
    sentiment_distribution,
    rating_distribution,
    aspect_summary,
    theme_summary,
    product_summary,
    total_reviews,
  } = data;

  const allProducts = product_summary?.top_products || [];
  // Guard: only include the product_id in the valid set so a stale dropdown
  // value from a previous upload cannot accidentally stay active.
  const allProductIds = allProducts.map((product) => product.product_id);
  const activeProductFocus = allProductIds.includes(selectedProductFocus) ? selectedProductFocus : 'all';
  // When a product is focused, show only that one row; otherwise show up to
  // the top 8 products to keep the table height reasonable.
  const focusedProduct = activeProductFocus === 'all'
    ? null
    : allProducts.find((product) => product.product_id === activeProductFocus) || null;
  const visibleTopProducts = focusedProduct ? [focusedProduct] : allProducts.slice(0, 8);
  const activeSentimentDistribution = focusedProduct
    ? productDistribution(focusedProduct)
    : sentiment_distribution;
  const activeTotalReviews = focusedProduct
    ? focusedProduct.total_reviews || focusedProduct.review_count || 0
    : total_reviews;
  const activeScopeLabel = focusedProduct ? `Product ${focusedProduct.product_id}` : 'All products';
  const totalProductReviews = allProducts.reduce((sum, product) => sum + (product.total_reviews || 0), 0);
  const avgReviewsPerProduct = allProducts.length > 0
    ? Math.round(totalProductReviews / allProducts.length)
    : 0;
  const mostReviewedProduct = allProducts.reduce(
    (top, product) => (!top || (product.total_reviews || 0) > (top.total_reviews || 0) ? product : top),
    null
  );

  // Recharts pie charts prefer an array of objects, so convert the active
  // sentiment buckets into a list with labels, values, and colors.
  const pieData = [
    { name: 'Positive', value: activeSentimentDistribution.positive.count, color: COLORS.positive },
    { name: 'Neutral', value: activeSentimentDistribution.neutral.count, color: COLORS.neutral },
    { name: 'Negative', value: activeSentimentDistribution.negative.count, color: COLORS.negative },
  ];

  // Convert keyed rating counts like {"1": 12, "2": 5} into chart rows.
  // If the uploaded file had no rating column, rating_distribution is null
  // and the component falls back to a plain stats card instead of a bar chart.
  const ratingData = rating_distribution
    ? Object.entries(rating_distribution).map(([rating, count]) => ({
        rating: `${rating}★`,
        count,
      }))
    : null;

  // Sort aspects by total mentions descending and take the top 5 for the
  // preview cards. The Aspects tab shows the full list.
  const topAspects = aspect_summary
    ? Object.entries(aspect_summary)
        .sort((a, b) => b[1].total_mentions - a[1].total_mentions)
        .slice(0, 5)
    : [];

  const topKeywords = theme_summary?.overall_keywords?.slice(0, 8) || [];

  const posNegRatio = activeSentimentDistribution.negative.count > 0
    ? (activeSentimentDistribution.positive.count / activeSentimentDistribution.negative.count).toFixed(1)
    : '∞';

  // Find whichever sentiment bucket has the most reviews so the guide modal
  // can name the "dominant sentiment" for this particular product or dataset.
  const dominantSentiment = pieData.reduce(
    (best, current) => (current.value > best.value ? current : best),
    pieData[0]
  );
  const leadAspect = topAspects[0];
  const leadKeyword = topKeywords[0];
  const totalPolarMentions =
    (theme_summary?.complaints_and_praises?.praises?.count || 0) +
    (theme_summary?.complaints_and_praises?.complaints?.count || 0);

  // Each info button in this section maps to one entry in `guideSections`.
  // The content is built from the current analysis payload, so the modal copy
  // changes with the uploaded dataset instead of using hard-coded examples.
  const guideSections = {
    positive: buildSentimentGuide({
      title: 'Positive Reviews',
      label: 'positive',
      count: activeSentimentDistribution.positive.count,
      percentage: activeSentimentDistribution.positive.percentage,
      totalReviews: activeTotalReviews,
      scopeLabel: activeScopeLabel,
      interpretation: activeSentimentDistribution.positive.percentage >= 60
        ? `${activeScopeLabel} leans clearly favorable.`
        : activeSentimentDistribution.positive.percentage >= 40
          ? 'Positive feedback is common, but not overwhelming.'
          : 'Positive feedback is present, but it is not the dominant pattern.',
    }),
    neutral: buildSentimentGuide({
      title: 'Neutral Reviews',
      label: 'neutral',
      count: activeSentimentDistribution.neutral.count,
      percentage: activeSentimentDistribution.neutral.percentage,
      totalReviews: activeTotalReviews,
      scopeLabel: activeScopeLabel,
      interpretation: activeSentimentDistribution.neutral.percentage >= 30
        ? 'Many reviews sound mixed, matter-of-fact, or undecided.'
        : 'Neutral reviews exist, but they are a smaller share of the dataset.',
    }),
    negative: buildSentimentGuide({
      title: 'Negative Reviews',
      label: 'negative',
      count: activeSentimentDistribution.negative.count,
      percentage: activeSentimentDistribution.negative.percentage,
      totalReviews: activeTotalReviews,
      scopeLabel: activeScopeLabel,
      interpretation: activeSentimentDistribution.negative.percentage >= 40
        ? 'Complaints are a major part of the selected reviews and should be reviewed.'
        : activeSentimentDistribution.negative.percentage >= 20
          ? 'There is noticeable dissatisfaction, but it is not the main story.'
          : 'Negative feedback exists, but it is limited compared with the rest of the reviews.',
    }),
    distribution: {
      title: focusedProduct ? 'Product Sentiment Distribution' : 'Overall Sentiment Distribution',
      description: 'This chart compares the positive, neutral, and negative review counts for the current dashboard scope.',
      items: [
        {
          label: 'Largest Segment',
          value: `${dominantSentiment.name} (${activeTotalReviews > 0 ? ((dominantSentiment.value / activeTotalReviews) * 100).toFixed(1) : 0}%)`,
          description: `Current result: ${dominantSentiment.name.toLowerCase()} is the biggest sentiment slice for ${activeScopeLabel}.`,
        },
        {
          label: 'Positive vs Negative',
          value: `${posNegRatio}:1`,
          description: posNegRatio === '∞'
            ? 'Current result: there were no negative reviews in this dataset, so the positive-to-negative ratio is effectively unlimited.'
            : `Current result: for every negative review, there are about ${posNegRatio} positive reviews. This helps non-technical users judge whether the mood is mostly favorable or more mixed.`,
        },
        {
          label: 'How To Read It',
          value: 'Slice size = review count',
          description: 'Larger slices mean more reviews were assigned to that sentiment. The legend beside the chart shows both the raw count and the percentage share.',
        },
      ],
    },
    rating: focusedProduct
      ? {
          title: 'Product Quality Summary',
          description: 'This card summarizes review volume, sentiment balance, and average rating for the selected product.',
          items: [
            {
              label: 'Selected Product',
              value: truncateId(focusedProduct.product_id, 80),
              description: defaultProductInsight(focusedProduct),
            },
            {
              label: 'Review Count',
              value: activeTotalReviews.toLocaleString(),
              description: 'This is the number of reviews used for the selected product summary.',
            },
            {
              label: 'Sentiment Split',
              value: `${focusedProduct.positive_pct}% / ${focusedProduct.neutral_pct}% / ${focusedProduct.negative_pct}%`,
              description: 'Read these in order as positive, neutral, and negative review share for the selected product.',
            },
          ],
        }
      : ratingData
      ? {
          title: 'Rating Distribution',
          description: 'This chart shows how the original star ratings are distributed in the uploaded dataset.',
          items: [
            {
              label: 'Most Common Rating',
              value: ratingData.reduce((best, current) => (current.count > best.count ? current : best), ratingData[0]).rating,
              description: `Current result: ${ratingData.reduce((best, current) => (current.count > best.count ? current : best), ratingData[0]).rating} appears most often, so that star level is the most common customer rating in the file.`,
            },
            {
              label: 'How To Read It',
              value: 'Bar height = reviews',
              description: 'Each bar shows how many reviews gave that star score. Taller bars mean that rating occurred more often.',
            },
            {
              label: 'Why It Matters',
              value: 'Cross-check sentiment',
              description: 'Comparing star ratings with predicted sentiment helps users see whether the text-based model broadly agrees with the ratings people originally gave.',
            },
          ],
        }
      : {
          title: 'Sentiment Stats',
          description: 'This fallback card summarizes the sentiment counts when the uploaded dataset does not include a rating column.',
          items: [
            {
              label: 'Total Reviews',
              value: total_reviews.toLocaleString(),
              description: 'Current result: this is the number of review texts that were analyzed in the current dataset.',
            },
            {
              label: 'Positive vs Negative',
              value: `${posNegRatio}:1`,
              description: posNegRatio === '∞'
                ? 'Current result: no negative reviews were detected, so the balance is entirely positive.'
                : `Current result: the dataset has about ${posNegRatio} positive reviews for every negative review.`,
            },
            {
              label: 'Extra Context',
              value: topAspects.length > 0 ? `${Object.keys(aspect_summary).length} aspects` : 'Sentiment only',
              description: topAspects.length > 0
                ? 'Aspect extraction also ran successfully, so users can go beyond sentiment and inspect which topics drive the results.'
                : 'Only sentiment counts are available here because no ratings were provided and no aspects were extracted.',
            },
          ],
        },
    topAspects: {
      title: 'Top Aspects',
      description: 'This preview highlights the review topics that were mentioned most often and shows how sentiment is split inside each topic.',
      items: [
        {
          label: 'Most Mentioned Aspect',
          value: leadAspect ? `${leadAspect[0]} (${leadAspect[1].total_mentions.toLocaleString()})` : 'Unavailable',
          description: leadAspect
            ? `Current result: ${leadAspect[0]} is mentioned most often, so it is the topic customers talk about the most in this dataset.`
            : 'Current result: no aspect mentions were available.',
        },
        {
          label: 'How To Read It',
          value: 'Green / yellow / red bar',
          description: 'Each stacked bar shows the internal split of positive, neutral, and negative mentions for that aspect. Longer green sections mean people describe that topic more favorably.',
        },
        {
          label: 'Why It Matters',
          value: `${Object.keys(aspect_summary || {}).length} aspects detected`,
          description: 'Aspect-level analysis tells beginners not just whether reviews are positive or negative, but exactly which product topics are driving that sentiment.',
        },
      ],
    },
    keywords: topKeywords.length > 0
      ? {
          title: 'Top Keywords',
          description: 'These are the most distinctive words extracted from the review corpus, plus a quick count of praise and complaint patterns.',
          items: [
            {
              label: 'Top Keyword',
              value: leadKeyword ? `${leadKeyword[0]} (${formatKeywordScore(leadKeyword[1])})` : 'Unavailable',
              description: leadKeyword
                ? `Current result: "${leadKeyword[0]}" is the strongest keyword signal in the current dataset, meaning it stands out more than the other extracted terms.`
                : 'Current result: no keyword ranking was available.',
            },
            {
              label: 'Praises vs Complaints',
              value: totalPolarMentions > 0 ? `${theme_summary.complaints_and_praises.praises?.count || 0} / ${theme_summary.complaints_and_praises.complaints?.count || 0}` : 'Unavailable',
              description: totalPolarMentions > 0
                ? `Current result: the theme model found ${theme_summary.complaints_and_praises.praises?.count || 0} praise patterns and ${theme_summary.complaints_and_praises.complaints?.count || 0} complaint patterns in the text.`
                : 'Current result: there were no praise or complaint aggregates available.',
            },
            {
              label: 'How To Read It',
              value: 'Higher score = more distinctive',
              description: 'The small number next to each keyword is a TF-IDF score. In simple terms, a higher score means the word stands out more strongly in this review collection.',
            },
          ],
        }
      : {
          title: 'Quick Stats',
          description: 'This fallback card summarizes the main counts when keyword extraction did not return any ranked terms.',
          items: [
            {
              label: 'Total Reviews',
              value: total_reviews.toLocaleString(),
              description: 'Current result: the dashboard analyzed this many review texts in total.',
            },
            {
              label: 'Aspects Detected',
              value: Object.keys(aspect_summary || {}).length.toLocaleString(),
              description: 'Current result: this is the number of distinct product topics the aspect analyzer was able to identify from the text.',
            },
            {
              label: 'Positive vs Negative',
              value: `${posNegRatio}:1`,
              description: posNegRatio === '∞'
                ? 'Current result: no negative reviews were detected, so the current dataset is entirely on the favorable side.'
                : `Current result: this ratio summarizes the balance between favorable and critical reviews in one number.`,
            },
          ],
        },
    products: allProducts.length > 0
      ? {
          title: 'Product-Level Sentiment',
          description: 'This panel compares review count and sentiment mix across product IDs.',
          items: [
            {
              label: 'Products Tracked',
              value: product_summary.total_products.toLocaleString(),
              description: `Current result: ${product_summary.total_products.toLocaleString()} product IDs have enough review data to be summarized in this analysis run.`,
            },
            {
              label: 'Visible Products',
              value: visibleTopProducts.length.toLocaleString(),
              description: focusedProduct
                ? 'Current result: one selected product is visible in the table.'
                : 'Current result: the table shows the first products by review volume.',
            },
            {
              label: 'How To Compare',
              value: 'Review count + % split',
              description: 'Compare products by review count first, then inspect positive, neutral, and negative percentages to understand product-specific quality.',
            },
          ],
        }
      : null,
  };

  // Resolve the currently active guide object. If no button has been clicked
  // yet (activeGuideKey is null), activeGuide will be null and the modal stays
  // unmounted.
  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid grid-3">
        <SentimentCard
          label="Positive"
          count={activeSentimentDistribution.positive.count}
          percentage={activeSentimentDistribution.positive.percentage}
          icon={<TrendingUp size={18} />}
          color="green"
          guideKey="positive"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="overview-guide"
        />
        <SentimentCard
          label="Neutral"
          count={activeSentimentDistribution.neutral.count}
          percentage={activeSentimentDistribution.neutral.percentage}
          icon={<Minus size={18} />}
          color="yellow"
          guideKey="neutral"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="overview-guide"
        />
        <SentimentCard
          label="Negative"
          count={activeSentimentDistribution.negative.count}
          percentage={activeSentimentDistribution.negative.percentage}
          icon={<TrendingDown size={18} />}
          color="red"
          guideKey="negative"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="overview-guide"
        />
      </div>

      {allProducts.length > 0 && (
        <div className="card">
          <CardHeaderWithGuide
            title="Product-Level Sentiment"
            icon={<BarChart3 size={14} style={{ color: 'var(--text-muted)' }} />}
            guideKey="products"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="overview-guide"
            actions={<span className="count-badge">{product_summary.total_products}</span>}
          />
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="grid grid-3">
              <MiniStat
                label={focusedProduct ? 'Product Reviews' : 'Products Tracked'}
                value={focusedProduct ? activeTotalReviews : product_summary.total_products}
                color="var(--text-accent)"
              />
              <MiniStat
                label={focusedProduct ? 'Positive Count' : 'Avg Reviews / Product'}
                value={focusedProduct ? activeSentimentDistribution.positive.count : avgReviewsPerProduct}
                color="var(--green)"
              />
              <MiniStat
                label={focusedProduct ? 'Negative Count' : 'Most Reviewed'}
                value={focusedProduct
                  ? activeSentimentDistribution.negative.count
                  : mostReviewedProduct
                    ? `${truncateId(mostReviewedProduct.product_id, 18)} (${mostReviewedProduct.total_reviews.toLocaleString()})`
                    : 'n/a'}
                color={focusedProduct ? 'var(--red)' : 'var(--yellow)'}
              />
            </div>

            {allProducts.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div className="section-label" style={{ marginBottom: 0 }}>Product Filter</div>
                <div className="trend-select-wrap" style={{ minWidth: 220 }}>
                  <select
                    className="input trend-select"
                    value={activeProductFocus}
                    onChange={(event) => setSelectedProductFocus(event.target.value)}
                    aria-label="Filter products in overview"
                  >
                    <option value="all">All products ({allProducts.length})</option>
                    {allProducts.map((product) => (
                      <option key={`overview-${product.product_id}`} value={product.product_id}>
                        {truncateId(product.product_id, 60)} ({product.total_reviews} reviews)
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </div>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product ID</th>
                    <th>Reviews</th>
                    <th>Positive %</th>
                    <th>Neutral %</th>
                    <th>Negative %</th>
                    <th>Avg Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTopProducts.map((product, index) => (
                    <tr key={`${product.product_id}-${index}`}>
                      <td>
                        <span className="mono" style={{ fontSize: 11, maxWidth: 360, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }} title={product.product_id}>
                          {product.product_id}
                        </span>
                      </td>
                      <td className="col-mono">{product.total_reviews.toLocaleString()}</td>
                      <td className="col-mono" style={{ color: 'var(--green)' }}>{product.positive_pct}%</td>
                      <td className="col-mono" style={{ color: 'var(--yellow)' }}>{product.neutral_pct}%</td>
                      <td className="col-mono" style={{ color: 'var(--red)' }}>{product.negative_pct}%</td>
                      <td className="col-mono">
                        {typeof product.avg_rating === 'number' ? product.avg_rating.toFixed(2) : 'n/a'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <CardHeaderWithGuide
            title={focusedProduct ? 'Product Sentiment Distribution' : 'Overall Sentiment Distribution'}
            guideKey="distribution"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="overview-guide"
          />
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ResponsiveContainer width="60%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={98}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={false}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => value.toLocaleString()}
                  contentStyle={tooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              {pieData.map((entry) => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{entry.name}</div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: entry.color }}>
                      {entry.value.toLocaleString()}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {activeTotalReviews > 0 ? ((entry.value / activeTotalReviews) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Pos / Neg Ratio
                </div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-accent)' }}>
                  {posNegRatio}:1
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                  For every negative review, there are {posNegRatio} positive ones.{` `}
                  {posNegRatio === '∞'
                    ? 'No negative reviews were detected.'
                    : parseFloat(posNegRatio) >= 4
                      ? 'Very favorable.'
                      : parseFloat(posNegRatio) >= 2
                        ? 'Generally positive.'
                        : parseFloat(posNegRatio) >= 1
                          ? 'Mixed sentiment.'
                          : 'More negative than positive.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {focusedProduct ? (
          <div className="card">
            <CardHeaderWithGuide
              title="Product Quality Summary"
              icon={<Zap size={14} style={{ color: 'var(--text-muted)' }} />}
              guideKey="rating"
              activeGuideKey={activeGuideKey}
              onOpenGuide={setActiveGuideKey}
              dialogId="overview-guide"
            />
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <StatRow label="Selected Product" value={truncateId(focusedProduct.product_id, 36)} />
                <StatRow label="Review Count" value={activeTotalReviews.toLocaleString()} />
                <StatRow label="Dominant Sentiment" value={focusedProduct.dominant_sentiment || dominantSentiment.name.toLowerCase()} color={dominantSentiment.color} />
                <StatRow label="Average Rating" value={typeof focusedProduct.avg_rating === 'number' ? focusedProduct.avg_rating.toFixed(2) : 'n/a'} />
                <StatRow label="Sentiment Split" value={`${focusedProduct.positive_pct}% / ${focusedProduct.neutral_pct}% / ${focusedProduct.negative_pct}%`} color="var(--text-accent)" />
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {defaultProductInsight(focusedProduct)}
                </div>
              </div>
            </div>
          </div>
        ) : ratingData ? (
          <div className="card">
            <CardHeaderWithGuide
              title="Rating Distribution"
              icon={<BarChart3 size={14} style={{ color: 'var(--text-muted)' }} />}
              guideKey="rating"
              activeGuideKey={activeGuideKey}
              onOpenGuide={setActiveGuideKey}
              dialogId="overview-guide"
            />
            <div className="card-body">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ratingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="rating"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    label={{ value: 'Star rating', position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 11 }}
                    height={48}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    label={{ value: 'Review count', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [value.toLocaleString(), 'Reviews']}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="count" name="Review count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="card">
            <CardHeaderWithGuide
              title="Sentiment Stats"
              icon={<Zap size={14} style={{ color: 'var(--text-muted)' }} />}
              guideKey="rating"
              activeGuideKey={activeGuideKey}
              onOpenGuide={setActiveGuideKey}
              dialogId="overview-guide"
            />
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <StatRow label="Total Reviews" value={total_reviews.toLocaleString()} />
                <StatRow label="Positive Reviews" value={sentiment_distribution.positive.count.toLocaleString()} color="var(--green)" />
                <StatRow label="Neutral Reviews" value={sentiment_distribution.neutral.count.toLocaleString()} color="var(--yellow)" />
                <StatRow label="Negative Reviews" value={sentiment_distribution.negative.count.toLocaleString()} color="var(--red)" />
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <StatRow label="Pos / Neg Ratio" value={`${posNegRatio}:1`} color="var(--text-accent)" />
                </div>
                {topAspects.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <StatRow label="Aspects Detected" value={Object.keys(aspect_summary).length} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {(topAspects.length > 0 || topKeywords.length > 0) && (
        <div className="grid grid-2">
          {topAspects.length > 0 && (
            <div className="card">
              <CardHeaderWithGuide
                title="Top Aspects"
                icon={<Tag size={14} style={{ color: 'var(--text-muted)' }} />}
                guideKey="topAspects"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="overview-guide"
                actions={<span className="count-badge">{Object.keys(aspect_summary).length}</span>}
              />
              <div className="card-body" style={{ padding: 0 }}>
                  {/* Each aspect row shows a mini stacked bar (green/yellow/red) whose
                      segment widths are the per-sentiment percentage of that aspect's
                      total mentions, computed inline here. */}
                  {topAspects.map(([aspect, stats], i) => {
                    const total = stats.positive_count + stats.neutral_count + stats.negative_count;
                    const posW = total > 0 ? (stats.positive_count / total) * 100 : 0;
                    const neuW = total > 0 ? (stats.neutral_count / total) * 100 : 0;
                    const negW = total > 0 ? (stats.negative_count / total) * 100 : 0;
                  return (
                    <div
                      key={aspect}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px',
                        borderBottom: i < topAspects.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'capitalize' }}>
                          {aspect}
                        </div>
                        <div className="bar-track" style={{ height: 4, borderRadius: 2 }}>
                          <div style={{ display: 'flex', height: '100%', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${posW}%`, background: COLORS.positive }} />
                            <div style={{ width: `${neuW}%`, background: COLORS.neutral }} />
                            <div style={{ width: `${negW}%`, background: COLORS.negative }} />
                          </div>
                        </div>
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {stats.total_mentions.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {topKeywords.length > 0 ? (
            <div className="card">
              <CardHeaderWithGuide
                title="Top Keywords"
                icon={<MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />}
                guideKey="keywords"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="overview-guide"
              />
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topKeywords.map(([word, score], i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {word}
                      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                        {formatKeywordScore(score)}
                      </span>
                    </span>
                  ))}
                </div>
                {theme_summary?.complaints_and_praises && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <MiniStat
                      label="Praises"
                      value={theme_summary.complaints_and_praises.praises?.count || 0}
                      color="var(--green)"
                    />
                    <MiniStat
                      label="Complaints"
                      value={theme_summary.complaints_and_praises.complaints?.count || 0}
                      color="var(--red)"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : topAspects.length > 0 && ratingData && (
            <div className="card">
              <CardHeaderWithGuide
                title="Quick Stats"
                icon={<Zap size={14} style={{ color: 'var(--text-muted)' }} />}
                guideKey="keywords"
                activeGuideKey={activeGuideKey}
                onOpenGuide={setActiveGuideKey}
                dialogId="overview-guide"
              />
              <div className="card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <StatRow label="Total Reviews" value={total_reviews.toLocaleString()} />
                  <StatRow label="Aspects Detected" value={Object.keys(aspect_summary).length} />
                  <StatRow label="Pos / Neg Ratio" value={`${posNegRatio}:1`} color="var(--text-accent)" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="overview-guide"
      />
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 16, fontWeight: 800, color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SentimentCard({
  label,
  count,
  percentage,
  icon,
  color,
  guideKey,
  activeGuideKey,
  onOpenGuide,
  dialogId,
}) {
  const colorMap = {
    green: { accent: 'var(--green)', border: 'var(--green)' },
    yellow: { accent: 'var(--yellow)', border: 'var(--yellow)' },
    red: { accent: 'var(--red)', border: 'var(--red)' },
  };
  const c = colorMap[color];

  return (
    <div className="card" style={{ borderLeft: `3px solid ${c.border}` }}>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
          <span style={{ color: c.accent }}>{icon}</span>
          <span className="mono" style={{ fontSize: 20, fontWeight: 800, color: c.accent }}>
            {percentage}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
          <GuideButton
            label={`Explain ${label.toLowerCase()} results`}
            onClick={() => onOpenGuide(guideKey)}
            expanded={activeGuideKey === guideKey}
            controls={dialogId}
          />
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {count.toLocaleString()} reviews
        </div>
        <div className="bar-track" style={{ marginTop: 10 }}>
          <div
            className={`bar-fill bar-fill-${color === 'yellow' ? 'yellow' : color}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function buildSentimentGuide({ title, label, count, percentage, totalReviews, scopeLabel, interpretation }) {
  // Helper used by the Positive / Neutral / Negative cards so those three
  // buttons share the same explanation structure with different live values.
  return {
    title,
    description: `This card summarizes how many reviews were classified as ${label} for ${scopeLabel || 'the current selection'}.`,
    items: [
      {
        label: 'Current Share',
        value: `${percentage}%`,
        description: `Current result: ${percentage}% of the selected reviews were classified as ${label}. Higher percentages mean this sentiment is more common in the current scope.`,
      },
      {
        label: 'Current Count',
        value: `${count.toLocaleString()} reviews`,
        description: `Current result: ${count.toLocaleString()} out of ${totalReviews.toLocaleString()} selected reviews landed in the ${label} category.`,
      },
      {
        label: 'Interpretation',
        value: label.charAt(0).toUpperCase() + label.slice(1),
        description: `Current result: ${interpretation}`,
      },
    ],
  };
}

function formatKeywordScore(score) {
  return typeof score === 'number' ? score.toFixed(2) : score;
}

export default SentimentOverview;
