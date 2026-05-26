// _6_SinglePredict.js
// ─────────────────────────────────────────────────────────────────────────────
// [Single Prediction Tab] Interactive Sentiment and Aspect testing sandbox.
//
// Background context and design choices:
// 1. What does this component do?
//    - Allows users to type or paste a single review verbatim text block
//      and test the classification model and aspect extraction rules in real-time.
// 2. Data flow:
//    - The user input text is transmitted via a POST request to `/api/predict`.
//    - The backend processes the review using identical training-time cleaners,
//      runs the classifier, computes probability margins, extracts aspect terms,
//      and returns a structured payload.
// 3. What is displayed?
//    - The predicted sentiment label (Positive, Neutral, Negative) along with confidence.
//    - Horizontal probability distribution tracks showing exact classification weights.
//    - Extract aspects tags displaying sentiment labels and TextBlob polarity scores.
//    - The cleaned text block to show preprocessing token transformations.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { predictSingle } from '../_1_api';

function SinglePredict() {
  // --- STATE HOOKS ---
  // text: stores the user's raw verbatim review input string.
  const [text, setText] = useState('');

  // result: holds the prediction outcomes returned from the backend (sentiment, probabilities, aspects).
  const [result, setResult] = useState(null);

  // isLoading: triggers visual loading animations on the submit button.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- API SUBMISSION CALLBACK ---
  // handlePredict: sends the input review to our Flask backend using the api wrapper.
  // Resets errors and updates loading indicators before transmitting the payload.
  const handlePredict = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await predictSingle(text);
      setResult(response.data); // saves the returned prediction payload (label, confidence, aspects)
    } catch (err) {
      setError(err.response?.data?.error || 'Prediction failed');
    } finally {
      setIsLoading(false);
    }
  };

  // handleKeyDown: intercepts keyboard actions on the textarea input field.
  // Pressing 'Enter' triggers submission immediately for a snappy user experience.
  // Pressing 'Shift+Enter' bypasses the submission, allowing users to enter carriage return line breaks.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePredict();
    }
  };

  // Color mappings used to apply green (positive), yellow (neutral), and red (negative) styling elements.
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

      {/* HEADER SECTION */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Test Sentiment Prediction</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Enter a review to see predicted sentiment and detected aspects.
          </p>
        </div>
      </div>

      {/* INPUT CARD: Text area verbatim field and analyze button */}
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

      {/* ERROR ALERT BOX */}
      {error && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* RESULT OUTCOME CONTAINER */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>

          {/* VISUAL BLOCK 1: PREDICTED SENTIMENT LABEL & CONFIDENCE */}
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

              {/* VISUAL BLOCK 1B: PROBABILITY DISTRIBUTION BARS
                  Traces the model's output weight across all 3 classes side-by-side. */}
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

          {/* VISUAL BLOCK 2: DETECTED ASPECT CHIPS LIST
              Shows which aspects were extracted, their label tone, and numeric polarity score. */}
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

          {/* VISUAL BLOCK 3: CLEANED VERBATIM DISPLAY
              Details what the text looked like after preprocessing contractions, emojis, and symbols. */}
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
            <div className="section-label">Cleaned Text</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{result.cleaned_text}</div>
          </div>
        </div>
      )}

      {/* VISUAL BLOCK 4: EXAMPLE PROMPT SANDBOX BUTTONS
          Lets users click pre-written reviews to quickly test predictions. */}
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
