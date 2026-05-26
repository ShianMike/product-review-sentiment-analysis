// _13_ReviewsTable.js
// ─────────────────────────────────────────────────────────────────────────────
// [Reviews Tab] Detailed Row-by-Row Review Table, Filter, Sort, and Export
//
// Background context and design choices:
// 1. Loading strategy:
//    - The initial dashboard response contains only a capped sample (500 rows)
//      to keep the dashboard rendering fast.
//    - When the user switches to this tab, it fires a query to `/api/reviews`
//      to fetch the full processed dataset from the backend exports on-demand.
// 2. Client-side search, filtering, and sorting:
//    - Once the full review set is loaded, all search matching, sentiment
//      filtering, date slicing, column sorting, and paginated display slicing
//      happen entirely in the browser. This eliminates API delay when typing.
// 3. Complicated drill-down filter (Keywords, Phrases, and Aspects):
//    - Compiles a list of available theme terms from text mining results
//      (TF-IDF keywords, n-gram phrases, word clouds) and detected aspects.
//    - Matches user choices against a combined review metadata index to find
//      exact occurrences.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, FileText, Loader2, Calendar, Download, Hash, X } from 'lucide-react';
import { getReviews } from '../../_1_api';

// Shorten long product identifiers to prevent filters and dropdown selectors
// from stretching the layout boundaries.
function truncateId(text, max = 50) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '...';
}

// buildThemeFilterOptions: compiles a dropdown choices list for the complicated drill-down filter.
// It searches through the backend's text-mining results (keywords, phrases, word clouds)
// and aspect categories extracted from all reviews, returning a deduplicated array
// of items formatted with category prefixes (e.g. "Keyword: soft", "Aspect: Delivery").
// Capped at 60 items to prevent the dropdown DOM list from degrading page scroll performance.
function buildThemeFilterOptions(themeSummary, reviews) {
  const terms = new Map();
  const addTerm = (term, prefix = 'Keyword') => {
    const normalized = normalizeThemeTerm(term);
    if (!normalized || terms.has(normalized)) return;
    terms.set(normalized, {
      value: normalized,
      label: `${prefix}: ${formatThemeLabel(term)}`,
    });
  };

  // 1. Add overall TF-IDF keywords
  (themeSummary?.overall_keywords || []).forEach(([term]) => addTerm(term));

  // 2. Add overall frequent phrases (N-grams)
  (themeSummary?.overall_phrases || []).forEach(([term]) => addTerm(term, 'Phrase'));

  // 3. Add sentiment-bucketed keywords and phrases
  Object.values(themeSummary?.themes_by_sentiment || {}).forEach((group) => {
    (group?.keywords || []).forEach(([term]) => addTerm(term));
    (group?.phrases || []).forEach(([term]) => addTerm(term, 'Phrase'));
  });

  // 4. Add praises and complaints keywords and phrases
  Object.values(themeSummary?.complaints_and_praises || {}).forEach((group) => {
    (group?.keywords || []).forEach(([term]) => addTerm(term));
    (group?.phrases || []).forEach(([term]) => addTerm(term, 'Phrase'));
  });

  // 5. Add words from dynamic word clouds
  Object.values(themeSummary?.word_clouds || {}).forEach((words) => {
    if (Array.isArray(words)) {
      words.forEach((word) => addTerm(word?.text || word?.[0]));
    }
  });

  // 6. Add aspects detected on review rows
  reviews.forEach((review) => {
    Object.keys(review.aspects || {}).forEach((aspect) => addTerm(aspect, 'Aspect'));
  });

  return Array.from(terms.values()).slice(0, 60);
}

// normalizeThemeTerm: converts terms to lowercase and collapses spaces.
// This ensures that terms match accurately, even if spacing or case formats differ.
function normalizeThemeTerm(term) {
  return String(term || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// formatThemeLabel: truncates long keywords or phrases so that they fit
// neatly inside the filter select dropdown options list.
function formatThemeLabel(term) {
  const text = String(term || '').trim();
  if (!text) return 'Unknown';
  return text.length > 34 ? `${text.slice(0, 34)}...` : text;
}

// reviewMatchesTheme: checks if a review record contains the user's selected filter term.
// Checks text, summaries, and aspects using getReviewThemeSearchText.
function reviewMatchesTheme(review, theme) {
  const term = normalizeThemeTerm(theme);
  if (!term) return true;
  return getReviewThemeSearchText(review).includes(term);
}

// getReviewThemeSearchText: compiles all searchable fields of a single review
// (original text, AI summary, product ID, aspect names, aspect tags, and aspect sentiment scores)
// into one single normalized search string to enable the drill-down filter match.
function getReviewThemeSearchText(review) {
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

/**
 * ReviewsTable Component
 *
 * Renders the table view, filters, pagination, and detail popup cards.
 * Implements search, category filters, date boundaries, sort indexes, and CSV exports.
 */
function ReviewsTable({ data }) {
  // --- STATE HOOKS ---
  // initialReviews: saves the capped sample (500 rows) from the main dashboard payload as our baseline fallback.
  const initialReviews = useMemo(() => (Array.isArray(data?.reviews) ? data.reviews : []), [data?.reviews]);
  const allProducts = data.product_summary?.top_products || [];
  const hasProductFilter = allProducts.length > 1 && Boolean(data.export_file);

  // selectedProduct: captures the active product filter. Defaults to 'all' for dataset-wide rows.
  const [selectedProduct, setSelectedProduct] = useState('all');

  // loadedReviews: stores the full list of reviews returned from the backend exports folder.
  const [loadedReviews, setLoadedReviews] = useState(initialReviews);
  const [loadedTotal, setLoadedTotal] = useState(initialReviews.length);

  // isFetchingReviews: tracks active API calls to show a loading spinner next to the export button.
  const [isFetchingReviews, setIsFetchingReviews] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Slicing filters stored in component state:
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // selectedReview: stores the review object currently open in the details pop-up modal.
  const [selectedReview, setSelectedReview] = useState(null);

  // Sorting state variables:
  const [sortField, setSortField] = useState('confidence'); // default sort: highest model-confidence reviews first
  const [sortDir, setSortDir] = useState('desc');           // descending order (highest score first) by default
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // limits page size to 20 rows to keep the UI scroll responsive

  const reviews = loadedReviews;
  const hasRating = reviews.some((r) => r.rating !== undefined && r.rating !== null);
  const hasProductId = reviews.some((r) => r.product_id);
  const hasDate = reviews.some((r) => r.date);

  // --- API DATA LOADER ---
  // loadReviewRows: fires an asynchronous request to fetch the entire review dataset from the backend exports folder.
  // This loads the full list on-demand, overriding the initial capped overview list.
  // If the API call fails, we safely fall back to the capped initialReviews dataset so the user can still see data.
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
      setCurrentPage(1); // reset pagination to the first page when loading new data
    } catch (err) {
      setLoadError(err.response?.data?.error || err.message || 'Unable to load all reviews.');
      setLoadedReviews(initialReviews);
      setLoadedTotal(initialReviews.length);
    } finally {
      setIsFetchingReviews(false);
    }
  }, [data.export_file, initialReviews]);

  // --- EFFECT: DATASET SYNCHRONIZATION ---
  // Automatically resets all search keywords, dropdown filters, sentiment filters, and modal states
  // and re-fetches review rows whenever the user uploads a new dataset.
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

  // --- PRODUCT DRILL-DOWN HANDLER ---
  // Triggered when the user selects a specific item in the product filter dropdown.
  // Resets query filters and queries the backend for reviews matching that product ID.
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

  // themeFilterOptions: compiles the choice list for our complicated drill-down filter.
  // Memoized so we don't re-parse the lists on simple keystroke updates (like typing text in search).
  const themeFilterOptions = useMemo(() => {
    return buildThemeFilterOptions(data.theme_summary, reviews);
  }, [data.theme_summary, reviews]);

  const hasThemeFilter = themeFilterOptions.length > 0;

  // Clean up selectedTheme filter option state if the current choice is no longer present in a newly loaded dropdown set.
  useEffect(() => {
    if (selectedTheme !== 'all' && !themeFilterOptions.some((option) => option.value === selectedTheme)) {
      setSelectedTheme('all');
    }
  }, [selectedTheme, themeFilterOptions]);

  // --- EFFECT: DETAILS MODAL ACCESSIBILITY ---
  // Listens for 'Escape' key presses to close the details card modal.
  // Automatically disables document scrolling (overflow: hidden) when the modal is open
  // to prevent double-scrollbars on background page elements, restoring it on close.
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

  // --- CLIENT-SIDE FILTERING & SORTING ENGINE ---
  // All search keywords, theme selectors, sentiment buttons, date slices, and column sorts
  // are compiled inside this single useMemo hook.
  // This ensures that we only re-run these expensive array filter operations when the user
  // actually changes a search keyword or sorting index.
  const filteredReviews = useMemo(() => {
    let result = [...reviews]; // create a shallow copy to avoid mutating our main state array directly

    // Step 1: Text Search
    // Scans the main review verbatim text, the optional AI summary, and the product ID.
    // Converted to lowercase to ensure case-insensitive matching.
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          String(r.text || '').toLowerCase().includes(term) ||
          String(r.summary || '').toLowerCase().includes(term) ||
          String(r.product_id || '').toLowerCase().includes(term)
      );
    }

    // Step 1b: Theme and Aspect Drill-Down
    // Filters reviews based on the chosen keyword, n-gram phrase, or aspect tag.
    if (selectedTheme !== 'all') {
      result = result.filter((r) => reviewMatchesTheme(r, selectedTheme));
    }

    // Step 2: Sentiment Filter
    // Filters reviews by their predicted sentiment label ('positive', 'neutral', 'negative').
    if (sentimentFilter !== 'all') {
      result = result.filter((r) => r.predicted_sentiment === sentimentFilter);
    }

    // Step 2b: Date Range Filter
    // Filters reviews to fit between 'dateFrom' and 'dateTo'.
    // Stored dates are parsed into millisecond timestamps. We add 24 hours (minus 1ms)
    // to the end date to ensure that reviews submitted on the final day are included.
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
      const toMs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
      result = result.filter((r) => {
        if (!r.date) return false;
        const rowMs = new Date(r.date).getTime();
        if (!Number.isFinite(rowMs)) return false;
        if (fromMs !== null && rowMs < fromMs) return false;
        if (toMs !== null && rowMs > toMs) return false;
        return true;
      });
    }

    // Step 3: Column Sorting
    // Orders rows based on the selected field (confidence, rating, date, text, etc.).
    // Values are passed through normalizeSortValue to convert strings to lowercase for alphabetical sorting,
    // while keeping numbers intact for correct mathematical sorting.
    result.sort((a, b) => {
      const valA = normalizeSortValue(a[sortField]);
      const valB = normalizeSortValue(b[sortField]);
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return result;
  }, [reviews, searchTerm, selectedTheme, sentimentFilter, dateFrom, dateTo, sortField, sortDir]);

  // --- PAGINATION BLOCK ---
  // Splits our sorted/filtered dataset into page chunks to keep page scroll performance smooth.
  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / itemsPerPage));
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const startRow = filteredReviews.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endRow = Math.min(currentPage * itemsPerPage, filteredReviews.length);

  // Automatically reset/constrain the active page number if filters reduce the row count
  // to a level where the current page number no longer exists.
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

  // handleSort: triggered when clicking a table column header.
  // Clicking the same header reverses the direction.
  // Clicking a different header switches to descending sort so highest scores/ratings show up first.
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // SortIcon: renders visual chevrons on the column header that is actively driving the sorting.
  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} style={{ display: 'inline', marginLeft: 2 }} />
    ) : (
      <ChevronDown size={12} style={{ display: 'inline', marginLeft: 2 }} />
    );
  };

  // sentimentBadge: maps sentiment scores to CSS badge styles defined in index.css (green, red, yellow).
  const sentimentBadge = (sentiment) => {
    const normalized = sentiment || 'neutral';
    const cls = `badge badge-${normalized}`;
    return <span className={cls}>{normalized}</span>;
  };

  // --- EXPORT CURRENT VIEW HANDLER ---
  // Compiles and exports the user's current filtered and sorted table view directly into a CSV file.
  // It handles header labeling, decimal formatting, nested aspect tag conversion, CSV cell character escaping,
  // UTF-8 BOM encoding for Microsoft Excel support, and triggers a download link simulation.
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

    // Format fields: convert nested aspect objects into semicolon-separated tags,
    // and format confidence levels to percentages.
    const rows = filteredReviews.map((review) => (
      columns.map(([key]) => {
        if (key === 'confidence') return formatConfidence(review.confidence);
        if (key === 'aspects') return formatReviewAspects(review.aspects);
        return review[key] ?? '';
      })
    ));

    // Combine headers and rows, escaping values to ensure valid CSV syntax (collapsing newlines, escaping quotes).
    const csv = [
      columns.map(([, label]) => label),
      ...rows,
    ].map((row) => row.map(escapeCsvValue).join(',')).join('\n');

    // Create a text Blob with a UTF-8 Byte Order Mark (\uFEFF) to make Excel parse the file correctly.
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

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 1: TOOLBAR & FILTERS
          Contains product-level drilldown dropdowns, search query bars, and
          the complicated drill-down theme filter options dropdown.
          ─────────────────────────────────────────────────────────────────────── */}
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

        {/* ───────────────────────────────────────────────────────────────────────
            VISUAL BLOCK 1B: DATE RANGE & SENTIMENT FILTERS
            Slices reviews by submission dates or quick predicted labels (positive, neutral, negative).
            ─────────────────────────────────────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 2: REVIEW COUNT & EXPORT CURRENT VIEW ACTION STRIP
          Exposes record statistics (total matches) and serves export download clicks.
          ─────────────────────────────────────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 3: DATA TABLE WITH CUSTOM SORTING & COLUMN HEADERS
          Displays sorted review text columns, product IDs, badges, scores, ratings, and aspect tags.
          ─────────────────────────────────────────────────────────────────────── */}
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

                {/* Aspects column: renders detected aspect keywords as color tags.
                    (Green = Positive, Red = Negative, Gray = Neutral). Capped at 8 tags to prevent cellular clutter. */}
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

      {/* ───────────────────────────────────────────────────────────────────────
          VISUAL BLOCK 4: PAGINATION CONTROLS
          Enables page switching when filtered list exceeds page sizes.
          ─────────────────────────────────────────────────────────────────────── */}
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

      {/* ReviewDetailModal: overlays full verbatims and aspects when clicking a row */}
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

/**
 * ReviewDetailModal Component
 *
 * Renders the overlay popup card to review specific verbatim details.
 * Contains model prediction progress track meters, metadata tag details,
 * scrolling customer verbatim blocks, AI summary text, and detected aspect chips.
 */
function ReviewDetailModal({ review, onClose, hasRating, hasProductId, hasDate }) {
  if (!review) return null;

  const aspects = Object.entries(review.aspects || {});
  const sentiment = review.predicted_sentiment || 'neutral';
  const confidencePercent = getConfidencePercent(review.confidence);

  // Conditionally compile meta tags based on columns present in CSV.
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

            {/* Sentiment prediction card with confidence track bar */}
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

            {/* Metadata tag card grid */}
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

            {/* Customer verbatim text container */}
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

              {/* Optional AI summary preview */}
              {review.summary && (
                <section className="review-detail-section review-detail-summary-card">
                  <div className="section-label">Summary</div>
                  <p className="review-detail-summary">"{review.summary}"</p>
                </section>
              )}

              {/* List of detected aspect category chips */}
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

/**
 * ReviewDetailMeta Component
 *
 * Renders a single metadata card inside the detail popup card grid (e.g. displaying Rating or Date).
 */
function ReviewDetailMeta({ label, value, mono = false }) {
  return (
    <div className="review-detail-meta-card">
      <div className="section-label">{label}</div>
      <div className={mono ? 'mono review-detail-meta-value' : 'review-detail-meta-value'}>{value}</div>
    </div>
  );
}

// getConfidencePercent: converts confidence float scores (0.0 to 1.0)
// into percentage values (0 to 100) to feed Recharts tracks.
function getConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric * 100));
}

/**
 * ReviewsProductFilter Component
 *
 * Renders the product filter select control and active fetching statuses.
 */
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

// normalizeSortValue: helper sorting normalizer.
// Converts strings to lowercase so character sorting is alphabetical rather than ASCII-cased.
function normalizeSortValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  return String(value).toLowerCase();
}

// escapeCsvValue: escapes cells for CSV compatibility.
// If values contain commas, quotes, or newlines, we wrap them in double quotes and escape inner quote marks.
function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// formatReviewAspects: flattens the aspects dictionary of a review row
// into a semicolon-separated string for CSV columns (e.g. "Price: positive; Quality: negative").
function formatReviewAspects(aspects) {
  if (!aspects || typeof aspects !== 'object') return '';
  return Object.entries(aspects)
    .map(([aspect, info]) => `${aspect}: ${info?.label || info?.sentiment || 'neutral'}`)
    .join('; ');
}

// getReviewExportFileName: generates a sanitized download filename for CSV reviews exports.
function getReviewExportFileName(productId) {
  const safeProduct = productId === 'all'
    ? 'all-products'
    : String(productId || 'selected-product').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50);
  return `reviews-${safeProduct}-${new Date().toISOString().slice(0, 10)}.csv`;
}

// formatConfidence: converts a float model score to a 1-decimal place percentage string (e.g. "98.2%").
function formatConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${(numeric * 100).toFixed(1)}%`;
}

// renderRating: renders star icons based on numerical values.
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
