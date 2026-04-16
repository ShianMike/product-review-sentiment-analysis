import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

function ReviewsTable({ data }) {
  const { reviews } = data;
  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [sortField, setSortField] = useState('confidence');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredReviews = useMemo(() => {
    let result = [...reviews];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.text.toLowerCase().includes(term) ||
          (r.summary && r.summary.toLowerCase().includes(term))
      );
    }

    if (sentimentFilter !== 'all') {
      result = result.filter((r) => r.predicted_sentiment === sentimentFilter);
    }

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

  const totalPages = Math.ceil(filteredReviews.length / itemsPerPage);
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} style={{ display: 'inline', marginLeft: 2 }} />
    ) : (
      <ChevronDown size={12} style={{ display: 'inline', marginLeft: 2 }} />
    );
  };

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
