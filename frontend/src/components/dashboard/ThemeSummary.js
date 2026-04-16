import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Hash, MessageCircle, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { GuideButton, CardHeaderWithGuide, InfoGuideModal } from './DashboardGuide';

function ThemeSummary({ data }) {
  const { theme_summary } = data;
  const [selectedSentiment, setSelectedSentiment] = useState('all');
  const [activeGuideKey, setActiveGuideKey] = useState(null);

  if (!theme_summary) {
    return (
      <div className="state state-empty">
        <h3>No theme data available</h3>
        <p>Theme extraction requires processed review data.</p>
      </div>
    );
  }

  const { overall_keywords, complaints_and_praises, word_cloud_data, themes_by_sentiment } = theme_summary;

  const praisesCount = complaints_and_praises?.praises?.count || 0;
  const complaintsCount = complaints_and_praises?.complaints?.count || 0;
  const totalSentiment = praisesCount + complaintsCount;
  const praiseRatio = totalSentiment > 0 ? ((praisesCount / totalSentiment) * 100).toFixed(1) : 0;
  const complaintRatio = totalSentiment > 0 ? ((complaintsCount / totalSentiment) * 100).toFixed(1) : 0;

  const topPraiseKeyword = complaints_and_praises?.praises?.keywords?.[0];
  const topComplaintKeyword = complaints_and_praises?.complaints?.keywords?.[0];
  const strongestKeyword = overall_keywords?.[0];
  const largestWord = word_cloud_data?.[0];
  const visibleSentimentGroups = themes_by_sentiment
    ? Object.entries(themes_by_sentiment).filter(([sentiment]) => selectedSentiment === 'all' || sentiment === selectedSentiment)
    : [];

  const guideSections = {
    praises: {
      title: 'Praises',
      description: 'This card counts positive recurring themes that the theme extractor identified in the review text.',
      items: [
        {
          label: 'Current Count',
          value: praisesCount.toLocaleString(),
          description: `Current result: ${praisesCount.toLocaleString()} praise patterns were found in the dataset.`,
        },
        {
          label: 'Share Of Polar Themes',
          value: `${praiseRatio}%`,
          description: 'This percentage compares praise themes only against praise and complaint themes, ignoring neutral text.',
        },
        {
          label: 'Interpretation',
          value: praisesCount >= complaintsCount ? 'More positive themes' : 'Fewer positive themes',
          description: praisesCount >= complaintsCount
            ? 'Current result: positive recurring themes outnumber complaints, so the extracted language trends lean favorable.'
            : 'Current result: praise themes are present, but complaints currently dominate the extracted polar themes.',
        },
      ],
    },
    complaints: {
      title: 'Complaints',
      description: 'This card counts negative recurring themes that appear across the review text.',
      items: [
        {
          label: 'Current Count',
          value: complaintsCount.toLocaleString(),
          description: `Current result: ${complaintsCount.toLocaleString()} complaint patterns were extracted from the current dataset.`,
        },
        {
          label: 'Share Of Polar Themes',
          value: `${complaintRatio}%`,
          description: 'This shows how large the complaint share is when compared only with positive and negative recurring themes.',
        },
        {
          label: 'Interpretation',
          value: complaintsCount > praisesCount ? 'Complaints lead' : 'Complaints trail',
          description: complaintsCount > praisesCount
            ? 'Current result: complaints outnumber praises, so the recurring text patterns lean more critical than favorable.'
            : 'Current result: complaint themes exist, but they are not the main recurring pattern.',
        },
      ],
    },
    extracted: {
      title: 'Keywords Extracted',
      description: 'This card shows how many overall keywords were pulled out of the reviews by the theme extractor.',
      items: [
        {
          label: 'Keyword Count',
          value: (overall_keywords?.length || 0).toLocaleString(),
          description: `Current result: ${overall_keywords?.length || 0} keywords were ranked for this dataset.`,
        },
        {
          label: 'Strongest Keyword',
          value: strongestKeyword ? `${strongestKeyword[0]} (${strongestKeyword[1].toFixed(3)})` : 'Unavailable',
          description: strongestKeyword
            ? `Current result: "${strongestKeyword[0]}" has the strongest TF-IDF weight, meaning it stands out the most compared with the rest of the review corpus.`
            : 'Current result: no keyword ranking is available.',
        },
        {
          label: 'How To Read It',
          value: 'Higher TF-IDF = more distinctive',
          description: 'For beginners, TF-IDF can be read as a "stand-out score" for words that appear often here but are not just generic filler.',
        },
      ],
    },
    topPraises: {
      title: 'Top Praises',
      description: 'This card summarizes the words and phrases most often associated with positive recurring themes.',
      items: [
        {
          label: 'Top Praise Keyword',
          value: topPraiseKeyword ? `${topPraiseKeyword[0]} (${topPraiseKeyword[1].toFixed(3)})` : 'Unavailable',
          description: topPraiseKeyword
            ? `Current result: "${topPraiseKeyword[0]}" is the strongest positive keyword signal in the extracted praise themes.`
            : 'Current result: there is no ranked praise keyword available.',
        },
        {
          label: 'Praise Theme Count',
          value: praisesCount.toLocaleString(),
          description: 'This is the number of positive recurring patterns found in the review text.',
        },
        {
          label: 'How To Read It',
          value: 'Keywords + phrases',
          description: 'The keywords show common positive terms, while the phrase list gives beginners a more readable example of how customers express those positive reactions.',
        },
      ],
    },
    topComplaints: {
      title: 'Top Complaints',
      description: 'This card summarizes the words and phrases most often associated with negative recurring themes.',
      items: [
        {
          label: 'Top Complaint Keyword',
          value: topComplaintKeyword ? `${topComplaintKeyword[0]} (${topComplaintKeyword[1].toFixed(3)})` : 'Unavailable',
          description: topComplaintKeyword
            ? `Current result: "${topComplaintKeyword[0]}" is the strongest negative keyword signal in the complaint themes.`
            : 'Current result: there is no ranked complaint keyword available.',
        },
        {
          label: 'Complaint Theme Count',
          value: complaintsCount.toLocaleString(),
          description: 'This is the number of recurring negative patterns found in the review text.',
        },
        {
          label: 'How To Use It',
          value: 'Problem diagnosis',
          description: 'Beginners can use this card to see what problems customers repeat most often without reading the full dataset line by line.',
        },
      ],
    },
    wordCloud: {
      title: 'Word Cloud',
      description: 'The word cloud turns keyword frequency into visual emphasis so the most repeated terms appear larger.',
      items: [
        {
          label: 'Largest Word',
          value: largestWord ? `${largestWord.text} (${largestWord.value.toLocaleString()})` : 'Unavailable',
          description: largestWord
            ? `Current result: "${largestWord.text}" is the largest word because it appears most strongly in the extracted word-cloud data.`
            : 'Current result: no word-cloud entries are available.',
        },
        {
          label: 'How To Read It',
          value: 'Bigger word = stronger presence',
          description: 'Larger words represent terms that appear more often or more strongly in the processed review text.',
        },
        {
          label: 'Why It Matters',
          value: 'Quick visual scan',
          description: 'This helps first-time users spot the dominant discussion themes before they inspect the ranked lists in detail.',
        },
      ],
    },
    tfidf: {
      title: 'Top Keywords by TF-IDF',
      description: 'This list ranks keywords by how distinctive they are in the review dataset.',
      items: [
        {
          label: 'Top Ranked Keyword',
          value: strongestKeyword ? `${strongestKeyword[0]} (${strongestKeyword[1].toFixed(3)})` : 'Unavailable',
          description: strongestKeyword
            ? `Current result: "${strongestKeyword[0]}" is the top-ranked keyword in the current analysis.`
            : 'Current result: no TF-IDF keyword ranking is available.',
        },
        {
          label: 'How To Read It',
          value: 'Longer bar = stronger signal',
          description: 'Each row combines a keyword with a score bar, so beginners can compare the relative strength of one term against the next.',
        },
        {
          label: 'Why It Matters',
          value: 'Theme prioritization',
          description: 'The ranking highlights which words best summarize what is distinctive about this review set, not just which words appear often everywhere.',
        },
      ],
    },
    bySentiment: {
      title: 'Keywords by Sentiment',
      description: 'This panel groups extracted keywords and phrases by sentiment category so users can compare what language appears in positive, neutral, and negative feedback.',
      items: [
        {
          label: 'Current Filter',
          value: selectedSentiment === 'all' ? 'All sentiments' : selectedSentiment,
          description: selectedSentiment === 'all'
            ? 'Current result: all sentiment groups are visible at the same time.'
            : `Current result: only the ${selectedSentiment} keyword group is currently being emphasized.`,
        },
        {
          label: 'Visible Groups',
          value: visibleSentimentGroups.length.toLocaleString(),
          description: `Current result: ${visibleSentimentGroups.length.toLocaleString()} sentiment group cards are visible under the current filter.`,
        },
        {
          label: 'How To Read It',
          value: 'One card per sentiment',
          description: 'Each card shows a keyword list and example phrases for one sentiment bucket, making it easier for beginners to see how the language changes between positive and negative reviews.',
        },
      ],
    },
  };

  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid grid-3">
        <ThemeMetricCard
          guideKey="praises"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="theme-guide"
          icon={<TrendingUp size={16} />}
          iconColor="var(--green)"
          iconBackground="rgba(34,197,94,0.1)"
          label="Praises"
          value={praisesCount.toLocaleString()}
          sub={`${praiseRatio}% of polar reviews`}
        />
        <ThemeMetricCard
          guideKey="complaints"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="theme-guide"
          icon={<TrendingDown size={16} />}
          iconColor="var(--red)"
          iconBackground="rgba(239,68,68,0.1)"
          label="Complaints"
          value={complaintsCount.toLocaleString()}
          sub={`${complaintRatio}% of polar reviews`}
        />
        <ThemeMetricCard
          guideKey="extracted"
          activeGuideKey={activeGuideKey}
          onOpenGuide={setActiveGuideKey}
          dialogId="theme-guide"
          icon={<Sparkles size={16} />}
          iconColor="var(--text-accent)"
          iconBackground="var(--accent-muted)"
          label="Keywords Extracted"
          value={(overall_keywords?.length || 0).toLocaleString()}
          sub="via TF-IDF analysis"
        />
      </div>

      <div className="grid grid-2">
        <div className="card" style={{ borderLeft: '3px solid var(--green)' }}>
          <CardHeaderWithGuide
            title="Top Praises"
            icon={<ThumbsUp size={14} style={{ color: 'var(--green)' }} />}
            titleStyle={{ color: 'var(--green)' }}
            guideKey="topPraises"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="theme-guide"
          />
          <div className="card-body" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="section-label">Keywords</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {complaints_and_praises?.praises?.keywords?.slice(0, 10).map(([word, score], i) => (
                  <span key={i} className="tag tag-green" title={`TF-IDF: ${score}`}>{word}</span>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div className="section-label">Common Phrases</div>
              {complaints_and_praises?.praises?.phrases?.slice(0, 6).map(([phrase, count], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{phrase}"</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
          <CardHeaderWithGuide
            title="Top Complaints"
            icon={<ThumbsDown size={14} style={{ color: 'var(--red)' }} />}
            titleStyle={{ color: 'var(--red)' }}
            guideKey="topComplaints"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="theme-guide"
          />
          <div className="card-body" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="section-label">Keywords</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {complaints_and_praises?.complaints?.keywords?.slice(0, 10).map(([word, score], i) => (
                  <span key={i} className="tag tag-red" title={`TF-IDF: ${score}`}>{word}</span>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div className="section-label">Common Phrases</div>
              {complaints_and_praises?.complaints?.phrases?.slice(0, 6).map(([phrase, count], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{phrase}"</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="theme-summary-layout">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 400 }}>
          <CardHeaderWithGuide
            title="Word Cloud"
            icon={<Hash size={14} style={{ color: 'var(--accent)' }} />}
            guideKey="wordCloud"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="theme-guide"
          />
          <div className="card-body" style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', alignItems: 'center', padding: '20px 16px' }}>
            {word_cloud_data?.slice(0, 60).map((item, i) => {
              const maxVal = word_cloud_data[0]?.value || 1;
              const ratio = item.value / maxVal;
              const fontSize = Math.max(11, Math.min(36, 11 + ratio * 25));
              const opacity = Math.max(0.3, ratio);

              return (
                <span
                  key={i}
                  style={{
                    fontSize: `${fontSize}px`,
                    opacity,
                    color: 'var(--text-accent)',
                    cursor: 'default',
                    fontWeight: ratio > 0.5 ? 700 : ratio > 0.25 ? 600 : 400,
                    lineHeight: 1.3,
                  }}
                  title={`${item.text}: ${item.value.toLocaleString()} occurrences`}
                >
                  {item.text}
                </span>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 400 }}>
          <CardHeaderWithGuide
            title="Top Keywords by TF-IDF"
            icon={<MessageCircle size={14} style={{ color: 'var(--accent)' }} />}
            guideKey="tfidf"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="theme-guide"
          />
          <div style={{ flex: 1, overflow: 'auto' }}>
            {overall_keywords?.map(([word, score], i) => {
              const maxScore = overall_keywords[0]?.[1] || 1;
              const barWidth = (score / maxScore) * 100;
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 16px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{word}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{score.toFixed(3)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{ width: `${barWidth}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {themes_by_sentiment && (
        <div className="card">
          <CardHeaderWithGuide
            title="Keywords by Sentiment"
            guideKey="bySentiment"
            activeGuideKey={activeGuideKey}
            onOpenGuide={setActiveGuideKey}
            dialogId="theme-guide"
            actions={
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'positive', 'neutral', 'negative'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSentiment(s)}
                    className={`btn btn-secondary ${selectedSentiment === s ? 'active' : ''}`}
                    style={{ fontSize: 10, padding: '4px 8px' }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            }
          />
          <div className="card-body">
            <div className="grid grid-3">
              {Object.entries(themes_by_sentiment)
                .filter(([sentiment]) => selectedSentiment === 'all' || sentiment === selectedSentiment)
                .map(([sentiment, themeData]) => {
                  const colorMap = {
                    positive: { border: 'var(--green)', tagClass: 'tag-green', bg: 'rgba(34,197,94,0.06)' },
                    neutral: { border: 'var(--yellow)', tagClass: 'tag-yellow', bg: 'rgba(234,179,8,0.06)' },
                    negative: { border: 'var(--red)', tagClass: 'tag-red', bg: 'rgba(239,68,68,0.06)' },
                  };
                  const c = colorMap[sentiment] || colorMap.neutral;

                  return (
                    <div
                      key={sentiment}
                      style={{
                        background: c.bg,
                        borderRadius: 'var(--radius)',
                        padding: 14,
                        borderLeft: `3px solid ${c.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                          {sentiment}
                        </span>
                        <span className="count-badge">{themeData.count?.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {themeData.keywords?.slice(0, 10).map(([word], i) => (
                          <span key={i} className={`tag ${c.tagClass}`} style={{ fontSize: 10 }}>
                            {word}
                          </span>
                        ))}
                      </div>
                      {themeData.phrases?.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOP PHRASES</div>
                          {themeData.phrases?.slice(0, 3).map(([phrase, count], i) => (
                            <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '2px 0', fontStyle: 'italic' }}>
                              "{phrase}" <span style={{ color: 'var(--text-muted)' }}>({count})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="theme-guide"
      />
    </div>
  );
}

function ThemeMetricCard({
  guideKey,
  activeGuideKey,
  onOpenGuide,
  dialogId,
  icon,
  iconColor,
  iconBackground,
  label,
  value,
  sub,
}) {
  return (
    <div className="card">
      <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: iconBackground, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</div>
            <GuideButton
              label={`Explain ${label.toLowerCase()}`}
              onClick={() => onOpenGuide(guideKey)}
              expanded={activeGuideKey === guideKey}
              controls={dialogId}
            />
          </div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: iconColor }}>{value}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

export default ThemeSummary;
