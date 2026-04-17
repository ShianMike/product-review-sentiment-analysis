// _12_ReviewsTable.js
// ─────────────────────────────────────────────────────────────────────────────
// Renders the "Reviews" tab of the dashboard.
// This component is purely client-side. The full review list is already inside
// `data.reviews` by the time the parent renders this. All filtering, sorting,
// and pagination happen in the browser with no additional backend calls.
//
// User controls:
//   - Text search: matches review body and optional summary field
//   - Sentiment quick-filter buttons: all / positive / neutral / negative
//   - Column header sort: text, predicted_sentiment, confidence, rating
//   - Paginated output: 20 rows per page with Previous / Next buttons
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

function ReviewsTable({ data }) {
  const { reviews } = data;
  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [sortField, setSortField] = useState('confidence'); // default sort: highest-confidence reviews first
  const [sortDir, setSortDir] = useState('desc');           // descending by default
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // show 20 rows per page to keep the table manageable

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
          r.text.toLowerCase().includes(term) ||
          (r.summary && r.summary.toLowerCase().includes(term))
      );
    }

    // Step 2 – sentiment quick-filter: 'all' skips this step entirely.
    if (sentimentFilter !== 'all') {
      result = result.filter((r) => r.predicted_sentiment === sentimentFilter);
    }

    // Step 3 – sort: works for both numeric fields (confidence, rating) and
    // string fields (text, predicted_sentiment). String comparison is
    // lowercased so sorting is case-insensitive.
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return result;
  }, [reviews, searchTerm, sentimentFilter, sortField, sortDir]);

  // Standard pagination: calculate total pages then slice the sorted result
  // to show only the current page's rows.
  const totalPages = Math.ceil(filteredReviews.length / itemsPerPage);
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
  // (e.g. badge-positive, badge-neutral, badge-negative) defined in index.css.
  const sentimentBadge = (sentiment) => {
    const cls = `badge badge-${sentiment}`;
    return <span className={cls}>{sentiment}</span>;
  };

  return (
    <div className="card">
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div className="input-wrap" style={{ flex: 1, minWidth: 180 }}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Search reviews..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="input"
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
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

      {/* Count */}
      <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
        Showing {paginatedReviews.length} of {filteredReviews.length} reviews
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '50%' }}>
                <button onClick={() => handleSort('text')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
                  Review Text <SortIcon field="text" />
                </button>
              </th>
              <th>
                <button onClick={() => handleSort('predicted_sentiment')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
                  Sentiment <SortIcon field="predicted_sentiment" />
                </button>
              </th>
              <th>
                <button onClick={() => handleSort('confidence')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
                  Confidence <SortIcon field="confidence" />
                </button>
              </th>
              {reviews[0]?.rating !== undefined && (
                <th>
                  <button onClick={() => handleSort('rating')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>
                    Rating <SortIcon field="rating" />
                  </button>
                </th>
              )}
              <th>Aspects</th>
            </tr>
          </thead>
          <tbody>
            {paginatedReviews.map((review, i) => (
              <tr key={i}>
                <td>
                  <div className="line-clamp-3" style={{ whiteSpace: 'normal', maxWidth: 400 }}>{review.text}</div>
                  {review.summary && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>"{review.summary}"</div>
                  )}
                </td>
                <td>{sentimentBadge(review.predicted_sentiment)}</td>
                <td className="col-mono">{(review.confidence * 100).toFixed(1)}%</td>
                {review.rating !== undefined && (
                  <td>
                    <span style={{ color: 'var(--yellow)' }}>{'★'.repeat(review.rating || 0)}</span>
                    <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - (review.rating || 0))}</span>
                  </td>
                )}
      {/* Aspects column: each detected aspect for this review is rendered
          as a color-coded tag (green = positive, red = negative, grey = neutral)
          so the reader can scan the topic sentiment at a glance. */}
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {Object.entries(review.aspects || {}).map(([aspect, info]) => (
                      <span
                        key={aspect}
                        className={`tag ${info.label === 'positive' ? 'tag-green' : info.label === 'negative' ? 'tag-red' : 'tag-muted'}`}
                        style={{ fontSize: 10, padding: '2px 6px' }}
                      >
                        {aspect}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
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
    </div>
  );
}

export default ReviewsTable;
