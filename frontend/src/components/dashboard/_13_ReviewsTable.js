// _13_ReviewsTable.js
// ─────────────────────────────────────────────────────────────────────────────
// Renders the "Reviews" tab of the dashboard.
// The dashboard response includes a capped review sample for fast initial load.
// When this tab opens, it asks the backend to read the saved processed export
// and return the full review list. Filtering, sorting, and pagination then
// happen in the browser against that loaded list.
//
// User controls:
//   - Text search: matches review body and optional summary field
//   - Sentiment quick-filter buttons: all / positive / neutral / negative
//   - Column header sort: text, predicted_sentiment, confidence, rating
//   - Paginated output: 20 rows per page with Previous / Next buttons
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, FileText, Loader2, Calendar, Download, Hash, X } from 'lucide-react';
import { getReviews } from '../../_1_api';

function truncateId(text, max = 50) {
  // Keep long product IDs from stretching review-table filters.
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function buildThemeFilterOptions(themeSummary, reviews) {
  // Build dropdown choices from keywords, phrases, word-cloud terms, and aspects.
  const terms = new Map();
  const addTerm = (term, prefix = 'Keyword') => {
    const normalized = normalizeThemeTerm(term);
    if (!normalized || terms.has(normalized)) return;
    terms.set(normalized, {
      value: normalized,
      label: `${prefix}: ${formatThemeLabel(term)}`,
    });
  };

  (themeSummary?.overall_keywords || []).forEach(([term]) => addTerm(term));
  (themeSummary?.overall_phrases || []).forEach(([term]) => addTerm(term, 'Phrase'));

  Object.values(themeSummary?.themes_by_sentiment || {}).forEach((group) => {
    (group?.keywords || []).forEach(([term]) => addTerm(term));
    (group?.phrases || []).forEach(([term]) => addTerm(term, 'Phrase'));
  });

  Object.values(themeSummary?.complaints_and_praises || {}).forEach((group) => {
    (group?.keywords || []).forEach(([term]) => addTerm(term));
    (group?.phrases || []).forEach(([term]) => addTerm(term, 'Phrase'));
  });

  Object.values(themeSummary?.word_clouds || {}).forEach((words) => {
    if (Array.isArray(words)) {
      words.forEach((word) => addTerm(word?.text || word?.[0]));
    }
  });

  reviews.forEach((review) => {
    Object.keys(review.aspects || {}).forEach((aspect) => addTerm(aspect, 'Aspect'));
  });

  return Array.from(terms.values()).slice(0, 60);
}

function normalizeThemeTerm(term) {
  // Normalize filter text so matching works even when spacing/casing differs.
  return String(term || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatThemeLabel(term) {
  // Shorten long theme labels for the dropdown.
  const text = String(term || '').trim();
  if (!text) return 'Unknown';
  return text.length > 34 ? `${text.slice(0, 34)}...` : text;
}

function reviewMatchesTheme(review, theme) {
  // Check whether one review contains the selected theme/aspect term.
  const term = normalizeThemeTerm(theme);
  if (!term) return true;
  return getReviewThemeSearchText(review).includes(term);
}

function getReviewThemeSearchText(review) {
  // Combine searchable review fields and aspect labels into one text string.
  const aspects = Object.entries(review.aspects || {}).flatMap(([aspect, info]) => [
    aspect,
    info?.label,
    info?.sentiment,
  ]);
  return [
    review.text,
    review.summary,
    review.product_id,
    ...aspects,
  ].map((value) => normalizeThemeTerm(value)).join(' ');
}

function ReviewsTable({ data }) {
  // The initial dashboard payload is capped for responsiveness. When available,
  // `/api/reviews` loads the full processed export so filtering and pagination
  // can cover every analyzed row.
  const initialReviews = useMemo(() => (Array.isArray(data?.reviews) ? data.reviews : []), [data?.reviews]);
  const allProducts = data.product_summary?.top_products || [];
  const hasProductFilter = allProducts.length > 1 && Boolean(data.export_file);
  const [selectedProduct, setSelectedProduct] = useState('all');
  const [loadedReviews, setLoadedReviews] = useState(initialReviews);
  const [loadedTotal, setLoadedTotal] = useState(initialReviews.length);
  const [isFetchingReviews, setIsFetchingReviews] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);
  const [sortField, setSortField] = useState('confidence'); // default sort: highest-confidence reviews first
  const [sortDir, setSortDir] = useState('desc');           // descending by default
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // show 20 rows per page to keep the table manageable
  const reviews = loadedReviews;
  const hasRating = reviews.some((r) => r.rating !== undefined && r.rating !== null);
  const hasProductId = reviews.some((r) => r.product_id);
  const hasDate = reviews.some((r) => r.date);

  const loadReviewRows = useCallback(async (productId) => {
    if (!data.export_file) {
      setLoadedReviews(initialReviews);
      setLoadedTotal(initialReviews.length);
      return;
    }

    try {
      setIsFetchingReviews(true);
      setLoadError('');
      const response = await getReviews(data.export_file, productId);
      const nextReviews = Array.isArray(response.data?.reviews) ? response.data.reviews : [];
      setLoadedReviews(nextReviews);
      setLoadedTotal(response.data?.total_reviews ?? nextReviews.length);
      setCurrentPage(1);
    } catch (err) {
      setLoadError(err.response?.data?.error || err.message || 'Unable to load all reviews.');
      setLoadedReviews(initialReviews);
      setLoadedTotal(initialReviews.length);
    } finally {
      setIsFetchingReviews(false);
    }
  }, [data.export_file, initialReviews]);

  useEffect(() => {
    setSelectedProduct('all');
    setSearchTerm('');
    setSelectedTheme('all');
    setSentimentFilter('all');
    setDateFrom('');
    setDateTo('');
    setSelectedReview(null);
    loadReviewRows('all');
  }, [data.export_file, loadReviewRows]);

  const handleProductChange = (productId) => {
    setSelectedProduct(productId);
    setSearchTerm('');
    setSelectedTheme('all');
    setSentimentFilter('all');
    setDateFrom('');
    setDateTo('');
    setSelectedReview(null);
    loadReviewRows(productId);
  };

  const themeFilterOptions = useMemo(() => {
    return buildThemeFilterOptions(data.theme_summary, reviews);
  }, [data.theme_summary, reviews]);

  const hasThemeFilter = themeFilterOptions.length > 0;

  useEffect(() => {
    if (selectedTheme !== 'all' && !themeFilterOptions.some((option) => option.value === selectedTheme)) {
      setSelectedTheme('all');
    }
  }, [selectedTheme, themeFilterOptions]);

  useEffect(() => {
    if (!selectedReview) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedReview(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedReview]);

  // All filtering and sorting is wrapped in one useMemo so it only recomputes
  // when searchTerm, sentimentFilter, sortField, or sortDir changes.
  const filteredReviews = useMemo(() => {
    let result = [...reviews]; // shallow copy so we don't mutate the prop

    // Step 1 – text search: check both the raw review text and the AI summary
    // (if one was included in the analysis output).
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          String(r.text || '').toLowerCase().includes(term) ||
          String(r.summary || '').toLowerCase().includes(term) ||
          String(r.product_id || '').toLowerCase().includes(term)
      );
    }

    if (selectedTheme !== 'all') {
      result = result.filter((r) => reviewMatchesTheme(r, selectedTheme));
    }

    // Step 2 – sentiment quick-filter: 'all' skips this step entirely.
    if (sentimentFilter !== 'all') {
      result = result.filter((r) => r.predicted_sentiment === sentimentFilter);
    }

    // Step 2b – date range filter: only applied when at least one bound is set
    // and the review row has a parseable date value.
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
      const toMs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null; // include the entire 'to' day
      result = result.filter((r) => {
        if (!r.date) return false;
        const rowMs = new Date(r.date).getTime();
        if (!Number.isFinite(rowMs)) return false;
        if (fromMs !== null && rowMs < fromMs) return false;
        if (toMs !== null && rowMs > toMs) return false;
        return true;
      });
    }

    // Step 3 – sort: works for both numeric fields (confidence, rating) and
    // string fields (text, predicted_sentiment). String comparison is
    // lowercased so sorting is case-insensitive.
    result.sort((a, b) => {
      const valA = normalizeSortValue(a[sortField]);
      const valB = normalizeSortValue(b[sortField]);
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return result;
  }, [reviews, searchTerm, selectedTheme, sentimentFilter, dateFrom, dateTo, sortField, sortDir]);

  // Standard pagination: calculate total pages then slice the sorted result
  // to show only the current page's rows.
  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / itemsPerPage));
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const startRow = filteredReviews.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endRow = Math.min(currentPage * itemsPerPage, filteredReviews.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  if (reviews.length === 0) {
    return (
      <div className="card">
        {hasProductFilter && (
          <ReviewsProductFilter
            allProducts={allProducts}
            selectedProduct={selectedProduct}
            onChange={handleProductChange}
            disabled={isFetchingReviews}
          />
        )}
        <div className="state state-empty">
          <FileText size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
          <h3>{isFetchingReviews ? 'Loading reviews' : 'No review rows available'}</h3>
          <p>
            {isFetchingReviews
              ? 'Loading the full review table from the processed export.'
              : loadError || 'This analysis result does not include review rows. Run a new analysis to populate this tab.'}
          </p>
        </div>
      </div>
    );
  }

  // Clicking a column header a second time reverses the sort direction.
  // Clicking a different column always starts descending so the most extreme
  // values appear at the top immediately.
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Renders a directional chevron icon next to the active sort column only.
  // Returns null for all other columns so the header row stays uncluttered.
  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} style={{ display: 'inline', marginLeft: 2 }} />
    ) : (
      <ChevronDown size={12} style={{ display: 'inline', marginLeft: 2 }} />
    );
  };

  // Produces a color-coded badge using the CSS class pattern badge-<sentiment>
  // (e.g. badge-positive, badge-neutral, badge-negative) defined in _15_index.css.
  const sentimentBadge = (sentiment) => {
    const normalized = sentiment || 'neutral';
    const cls = `badge badge-${normalized}`;
    return <span className={cls}>{normalized}</span>;
  };

  const handleExportReviews = () => {
    if (filteredReviews.length === 0) return;

    const columns = [
      ['text', 'Review Text'],
      ['summary', 'Summary'],
      ['product_id', 'Product'],
      ['predicted_sentiment', 'Sentiment'],
      ['confidence', 'Confidence'],
      ['rating', 'Rating'],
      ['date', 'Date'],
      ['aspects', 'Aspects'],
    ];
    const rows = filteredReviews.map((review) => (
      columns.map(([key]) => {
        if (key === 'confidence') return formatConfidence(review.confidence);
        if (key === 'aspects') return formatReviewAspects(review.aspects);
        return review[key] ?? '';
      })
    ));
    const csv = [
      columns.map(([, label]) => label),
      ...rows,
    ].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = getReviewExportFileName(selectedProduct);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card reviews-card">
      {/* Filters */}
      <div className="reviews-toolbar">
        <div className="reviews-filter-row reviews-filter-row-main">
          {hasProductFilter && (
            <ReviewsProductFilter
              allProducts={allProducts}
              selectedProduct={selectedProduct}
              onChange={handleProductChange}
              disabled={isFetchingReviews}
            />
          )}
          <div className="input-wrap reviews-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search review text, summary, or product..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="input"
            />
          </div>
          {hasThemeFilter && (
            <div className="trend-select-wrap reviews-theme-select">
              <Hash size={14} className="reviews-theme-icon" aria-hidden="true" />
              <select
                className="input trend-select"
                value={selectedTheme}
                onChange={(e) => { setSelectedTheme(e.target.value); setCurrentPage(1); }}
                aria-label="Filter reviews by keyword or theme"
              >
                <option value="all">All keywords/themes</option>
                {themeFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="reviews-theme-arrow" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="reviews-filter-row reviews-filter-row-secondary">
          {hasDate && (
            <div className="reviews-date-filter" aria-label="Filter reviews by date range">
              <Calendar size={14} />
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                className="input reviews-date-input"
                aria-label="Start date"
              />
              <span className="reviews-date-separator">to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                className="input reviews-date-input"
                aria-label="End date"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  className="btn btn-secondary reviews-date-clear"
                  onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <div className="reviews-filter-group">
            {['all', 'positive', 'neutral', 'negative'].map((s) => (
              <button
                key={s}
                onClick={() => { setSentimentFilter(s); setCurrentPage(1); }}
                className={`btn btn-secondary ${sentimentFilter === s ? 'active' : ''}`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Count */}
      <div className="reviews-count-strip">
        <span>
          Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {filteredReviews.length.toLocaleString()} loaded reviews
        </span>
        <div className="reviews-count-actions">
          <span className="reviews-cap-note">
            {isFetchingReviews && (
              <>
                <Loader2 size={12} className="spin" />
                Loading all reviews
              </>
            )}
            {!isFetchingReviews && loadError && loadError}
            {!isFetchingReviews && !loadError && loadedTotal > reviews.length && (
              <>Table sample: {reviews.length.toLocaleString()} of {loadedTotal.toLocaleString()} processed</>
            )}
            {!isFetchingReviews && !loadError && loadedTotal === reviews.length && (
              <>All {loadedTotal.toLocaleString()} reviews loaded</>
            )}
          </span>
          {data.total_reviews > reviews.length && !data.export_file && (
            <span className="reviews-cap-note">
              Table sample: {reviews.length.toLocaleString()} of {data.total_reviews.toLocaleString()} processed
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary reviews-export-btn"
            onClick={handleExportReviews}
            disabled={filteredReviews.length === 0}
          >
            <Download size={13} />
            Export Current View
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="reviews-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '50%' }}>
                <button onClick={() => handleSort('text')} className="table-sort-btn">
                  Review Text <SortIcon field="text" />
                </button>
              </th>
              {hasProductId && (
                <th>
                  <button onClick={() => handleSort('product_id')} className="table-sort-btn">
                    Product <SortIcon field="product_id" />
                  </button>
                </th>
              )}
              <th>
                <button onClick={() => handleSort('predicted_sentiment')} className="table-sort-btn">
                  Sentiment <SortIcon field="predicted_sentiment" />
                </button>
              </th>
              <th>
                <button onClick={() => handleSort('confidence')} className="table-sort-btn">
                  Confidence <SortIcon field="confidence" />
                </button>
              </th>
              {hasRating && (
                <th>
                  <button onClick={() => handleSort('rating')} className="table-sort-btn">
                    Rating <SortIcon field="rating" />
                  </button>
                </th>
              )}
              {hasDate && (
                <th>
                  <button onClick={() => handleSort('date')} className="table-sort-btn">
                    Date <SortIcon field="date" />
                  </button>
                </th>
              )}
              <th>Aspects</th>
            </tr>
          </thead>
          <tbody>
            {paginatedReviews.map((review, i) => (
              <tr
                key={`${review.text}-${i}`}
                className="reviews-row-clickable"
                tabIndex={0}
                onClick={() => setSelectedReview(review)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedReview(review);
                  }
                }}
                aria-label="Open review details"
              >
                <td>
                  <div className="line-clamp-3 reviews-text-cell">{review.text || 'No review text'}</div>
                  {review.summary && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>"{review.summary}"</div>
                  )}
                </td>
                {hasProductId && (
                  <td className="reviews-product-cell">{review.product_id || '-'}</td>
                )}
                <td>{sentimentBadge(review.predicted_sentiment)}</td>
                <td className="col-mono">{formatConfidence(review.confidence)}</td>
                {hasRating && (
                  <td>{renderRating(review.rating)}</td>
                )}
                {hasDate && (
                  <td className="reviews-date-cell">{review.date || '-'}</td>
                )}
      {/* Aspects column: each detected aspect for this review is rendered
          as a color-coded tag (green = positive, red = negative, grey = neutral)
          so the reader can scan the topic sentiment at a glance. */}
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {Object.entries(review.aspects || {}).length > 0 ? (
                      Object.entries(review.aspects || {}).slice(0, 8).map(([aspect, info]) => {
                        const label = info?.label || info?.sentiment || 'neutral';
                        return (
                          <span
                            key={aspect}
                            className={`tag ${label === 'positive' ? 'tag-green' : label === 'negative' ? 'tag-red' : 'tag-muted'}`}
                            style={{ fontSize: 10, padding: '2px 6px' }}
                            title={`${aspect}: ${label}`}
                          >
                            {aspect}
                          </span>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>None detected</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="reviews-pagination">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      )}
      <ReviewDetailModal
        review={selectedReview}
        onClose={() => setSelectedReview(null)}
        hasRating={hasRating}
        hasProductId={hasProductId}
        hasDate={hasDate}
      />
    </div>
  );
}

function ReviewDetailModal({ review, onClose, hasRating, hasProductId, hasDate }) {
  if (!review) return null;

  const aspects = Object.entries(review.aspects || {});
  const sentiment = review.predicted_sentiment || 'neutral';
  const confidencePercent = getConfidencePercent(review.confidence);
  const metaItems = [
    hasRating ? { label: 'Rating', value: review.rating ?? '-', mono: true } : null,
    hasDate ? { label: 'Date', value: review.date || '-', mono: true } : null,
    hasProductId ? { label: 'Product', value: review.product_id || '-' } : null,
  ].filter(Boolean);

  return (
    <div className="modal-backdrop review-detail-backdrop" onClick={onClose}>
      <div
        className={`modal-card review-detail-modal review-detail-modal-${sentiment}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header review-detail-header">
          <div className="modal-header-copy">
            <div className="review-detail-kicker">
              <span className={`review-detail-signal review-detail-signal-${sentiment}`} />
              Review evidence
            </div>
            <h3 id="review-detail-title">Review Details</h3>
            <p>Inspect the full review text, prediction confidence, metadata, and detected aspect sentiment.</p>
          </div>
          <button
            type="button"
            className="btn-icon review-detail-close"
            onClick={onClose}
            aria-label="Close review details"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body review-detail-body">
          <div className="review-detail-hero">
            <section className="review-detail-sentiment-card">
              <div className="section-label">Prediction</div>
              <div className="review-detail-sentiment-main">
                <span className={`review-detail-sentiment-badge review-detail-sentiment-${sentiment}`}>
                  {sentiment}
                </span>
                <span className="review-detail-confidence-value mono">{formatConfidence(review.confidence)}</span>
              </div>
              <div
                className="review-detail-confidence-track"
                style={{ '--review-confidence': `${confidencePercent}%` }}
                aria-hidden="true"
              >
                <span />
              </div>
              <p>Model confidence for this individual review classification.</p>
            </section>

            {metaItems.length > 0 && (
              <div className="review-detail-meta-grid">
                {metaItems.map((item) => (
                  <ReviewDetailMeta
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    mono={item.mono}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="review-detail-content-grid">
            <section className="review-detail-section review-detail-review-card">
              <div className="review-detail-section-heading">
                <div>
                  <div className="section-label">Review Text</div>
                  <h4>Customer verbatim</h4>
                </div>
                <FileText size={18} />
              </div>
              <p className="review-detail-text">{review.text || 'No review text'}</p>
            </section>

            <div className="review-detail-side-stack">
              {review.summary && (
                <section className="review-detail-section review-detail-summary-card">
                  <div className="section-label">Summary</div>
                  <p className="review-detail-summary">"{review.summary}"</p>
                </section>
              )}
              <section className="review-detail-section review-detail-aspect-card">
                <div className="review-detail-section-heading">
                  <div>
                    <div className="section-label">Detected Aspects</div>
                    <h4>Topic sentiment</h4>
                  </div>
                  <Hash size={18} />
                </div>
                {aspects.length > 0 ? (
                  <div className="review-detail-aspects">
                    {aspects.map(([aspect, info]) => {
                      const label = info?.label || info?.sentiment || 'neutral';
                      return (
                        <span
                          key={aspect}
                          className={`review-detail-aspect-chip review-detail-aspect-${label}`}
                          title={`${aspect}: ${label}`}
                        >
                          <span className="review-detail-aspect-dot" aria-hidden="true" />
                          {aspect}: {label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="review-detail-muted">None detected</span>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewDetailMeta({ label, value, mono = false }) {
  return (
    <div className="review-detail-meta-card">
      <div className="section-label">{label}</div>
      <div className={mono ? 'mono review-detail-meta-value' : 'review-detail-meta-value'}>{value}</div>
    </div>
  );
}

function getConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric * 100));
}

function ReviewsProductFilter({ allProducts, selectedProduct, onChange, disabled }) {
  return (
    <div className="reviews-product-filter">
      <div className="section-label" style={{ marginBottom: 0 }}>Product Filter</div>
      <div className="trend-select-wrap reviews-product-select">
        <select
          className="input trend-select"
          value={selectedProduct}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Filter reviews by product"
        >
          <option value="all">All products ({allProducts.length})</option>
          {allProducts.map((p) => (
            <option key={p.product_id} value={p.product_id}>
              {truncateId(p.product_id, 72)} ({Number(p.total_reviews || 0).toLocaleString()})
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
      {disabled && (
        <span className="reviews-product-loading">
          <Loader2 size={12} className="spin" />
          Loading reviews...
        </span>
      )}
    </div>
  );
}

function normalizeSortValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  return String(value).toLowerCase();
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatReviewAspects(aspects) {
  if (!aspects || typeof aspects !== 'object') return '';
  return Object.entries(aspects)
    .map(([aspect, info]) => `${aspect}: ${info?.label || info?.sentiment || 'neutral'}`)
    .join('; ');
}

function getReviewExportFileName(productId) {
  const safeProduct = productId === 'all'
    ? 'all-products'
    : String(productId || 'selected-product').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50);
  return `reviews-${safeProduct}-${new Date().toISOString().slice(0, 10)}.csv`;
}

function formatConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${(numeric * 100).toFixed(1)}%`;
}

function renderRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return <span style={{ color: 'var(--text-muted)' }}>-</span>;

  const rating = Math.max(0, Math.min(5, Math.round(numeric)));
  return (
    <span className="reviews-rating" title={`${numeric} out of 5`}>
      <span style={{ color: 'var(--yellow)' }}>{'★'.repeat(rating)}</span>
      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export default ReviewsTable;
