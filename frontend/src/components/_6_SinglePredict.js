import React, { useState } from 'react';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { predictSingle } from '../_1_api';

// Fulfills Project.txt Functional Requirement 7.2 by letting users test the
// trained classifier and ABSA logic on one review without uploading a dataset.
function SinglePredict() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sends one review to the Flask API and stores the returned sentiment,
  // confidence, and aspect labels for the result panel below.
  const handlePredict = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await predictSingle(text);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Prediction failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Enter submits quickly, while Shift+Enter still lets the user add new lines.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePredict();
    }
  };

  const sentimentColor = {
    positive: 'var(--green)',
    neutral: 'var(--yellow)',
    negative: 'var(--red)',
  };

  const barColors = {
    positive: 'var(--green)',
    neutral: 'var(--yellow)',
    negative: 'var(--red)',
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Test Sentiment Prediction</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Enter a review to see predicted sentiment and detected aspects.
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="card">
        <div className="card-body">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type or paste a product review here..."
            className="textarea"
            rows={4}
          />
          <button
            onClick={handlePredict}
            disabled={!text.trim() || isLoading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 10, padding: '10px 16px' }}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="spin" /> Analyzing...
              </>
            ) : (
              <>
                <Send size={16} /> Predict Sentiment
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {/* Sentiment Result */}
          <div className="card" style={{ borderLeft: `3px solid ${sentimentColor[result.predicted_sentiment]}` }}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 800, textTransform: 'capitalize', color: sentimentColor[result.predicted_sentiment] }}>
                  {result.predicted_sentiment}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Confidence: {(result.confidence * 100).toFixed(1)}%
                </span>
              </div>

              {/* Probability bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(result.probabilities).map(([label, prob]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 60, textTransform: 'capitalize' }}>{label}</span>
                    <div className="bar-track" style={{ flex: 1, height: 8 }}>
                      <div
                        className="bar-fill"
                        style={{ width: `${(prob * 100).toFixed(1)}%`, background: barColors[label], height: '100%' }}
                      />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', width: 42, textAlign: 'right' }}>
                      {(prob * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Aspects */}
          {result.aspects && Object.keys(result.aspects).length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Detected Aspects</h3>
              </div>
              <div className="card-body">
                <div className="grid grid-2">
                  {Object.entries(result.aspects).map(([aspect, info]) => (
                    <div
                      key={aspect}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-tertiary)',
                        borderLeft: `3px solid ${sentimentColor[info.label] || 'var(--border)'}`,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>{aspect}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge badge-${info.label}`} style={{ fontSize: 10, padding: '2px 6px' }}>{info.label}</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{info.polarity.toFixed(3)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cleaned Text */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
            <div className="section-label">Cleaned Text</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{result.cleaned_text}</div>
          </div>
        </div>
      )}

      {/* Example Prompts */}
      <div style={{ marginTop: 24 }}>
        <div className="section-label" style={{ textAlign: 'center', marginBottom: 8 }}>Try these examples</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            "This product is amazing! Great quality and fast delivery. Worth every penny.",
            "Terrible quality, broke after one week. Customer service was unhelpful. Would not recommend.",
            "It's okay, nothing special. The price is reasonable but the taste could be better.",
          ].map((example, i) => (
            <button
              key={i}
              onClick={() => setText(example)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'var(--bg-hover)'; e.target.style.borderColor = 'var(--border-focus)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'var(--bg-card)'; e.target.style.borderColor = 'var(--border)'; }}
            >
              "{example}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SinglePredict;
