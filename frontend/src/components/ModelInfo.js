import React, { useState, useEffect } from 'react';
import { Info, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getModelInfo, healthCheck } from '../api';
import { GuideButton, InfoGuideModal } from './dashboard/DashboardGuide';

// Demo guide: this component supports the model-performance part of the presentation.
function ModelInfo() {
  const [modelData, setModelData] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeGuideKey, setActiveGuideKey] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [modelRes, healthRes] = await Promise.all([
          getModelInfo(),
          healthCheck(),
        ]);
        setModelData(modelRes.data);
        setHealth(healthRes.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load model info');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="state state-loading">
        <Loader2 size={28} className="spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error" style={{ maxWidth: 560, margin: '0 auto' }}>
        {error}
      </div>
    );
  }

  const metrics = modelData?.evaluation_metrics;
  const report = metrics?.classification_report;
  const classLabels = Array.isArray(metrics?.class_labels) ? metrics.class_labels : [];
  const confusionMatrix = Array.isArray(metrics?.confusion_matrix) ? metrics.confusion_matrix : [];
  const totalMatrixCount = confusionMatrix.reduce(
    (sum, row) => sum + (Array.isArray(row) ? row.reduce((rowSum, value) => rowSum + value, 0) : 0),
    0
  );
  const diagonalCount = confusionMatrix.reduce(
    (sum, row, index) => sum + (Array.isArray(row) ? row[index] || 0 : 0),
    0
  );
  const classOrder = classLabels.length ? classLabels.map(toTitleCase).join(', ') : 'Unavailable';

  // The Model Info page uses the same guide pattern as the dashboard:
  // each section header button selects one key here, and the shared modal
  // renders the matching explanatory cards using live backend metrics.
  const guideSections = {
    system: {
      title: 'System Status',
      description: 'These indicators show whether the backend and the trained classifier are currently ready to serve requests.',
      items: [
        {
          label: 'API Server',
          value: health?.status === 'ok' ? 'Running' : 'Offline',
          description: health?.status === 'ok'
            ? 'Current result: Running means the backend service is online and responding to dashboard requests.'
            : 'Current result: Offline means the dashboard cannot reach the backend service right now.',
        },
        {
          label: 'Sentiment Model',
          value: health?.model_loaded ? 'Loaded' : 'Not loaded',
          description: health?.model_loaded
            ? 'Current result: Loaded means the trained sentiment classifier is already in memory and can make predictions immediately.'
            : 'Current result: Not loaded means predictions will not work until the trained model is loaded.',
        },
      ],
    },
    details: {
      title: 'Model Details',
      description: 'These values describe what model is being used and how much data was used to train and test it.',
      items: [
        {
          label: 'Model Type',
          value: modelData?.model_type || 'Unavailable',
          description: modelData?.model_type
            ? `Current result: ${modelData.model_type} means the app first converts review text into weighted word features, then predicts sentiment with a Logistic Regression classifier.`
            : 'Current result: Unavailable means the model type was not returned by the backend.',
        },
        {
          label: 'Training Size',
          value: formatReviewCount(metrics?.train_size),
          description: typeof metrics?.train_size === 'number'
            ? `Current result: ${formatReviewCount(metrics.train_size)} were used to teach the model the patterns behind positive, neutral, and negative reviews.`
            : 'Current result: Unavailable means the training set size was not returned.',
        },
        {
          label: 'Test Size',
          value: formatReviewCount(metrics?.test_size),
          description: typeof metrics?.test_size === 'number'
            ? `Current result: ${formatReviewCount(metrics.test_size)} were kept separate from training and used only to measure how well the model performs on unseen data.`
            : 'Current result: Unavailable means the test set size was not returned.',
        },
        {
          label: 'Aspect Categories',
          value: formatList(modelData?.aspect_categories),
          description: Array.isArray(modelData?.aspect_categories) && modelData.aspect_categories.length
            ? `Current result: the aspect analyzer is configured to track these review topics: ${modelData.aspect_categories.join(', ')}.`
            : 'Current result: Unavailable means no aspect categories were returned.',
        },
      ],
    },
    ...(metrics ? {
      overall: {
        title: 'Overall Performance',
        description: 'These summary metrics show how well the classifier performed across the full test dataset.',
        items: [
          {
            label: 'Accuracy',
            value: formatPercentage(metrics?.accuracy),
            description: typeof metrics?.accuracy === 'number'
              ? `Current result: ${formatPercentage(metrics.accuracy)} means the model correctly classified about ${Math.round(metrics.accuracy * 100)} out of every 100 test reviews.`
              : 'Current result: Unavailable means overall accuracy was not returned.',
          },
          {
            label: 'Precision (Macro)',
            value: formatPercentage(metrics?.precision_macro),
            description: typeof metrics?.precision_macro === 'number'
              ? `Current result: ${formatPercentage(metrics.precision_macro)} means that, averaged equally across classes, the model's predicted sentiment labels are correct about ${Math.round(metrics.precision_macro * 100)} times out of 100.`
              : 'Current result: Unavailable means macro precision was not returned.',
          },
          {
            label: 'Recall (Macro)',
            value: formatPercentage(metrics?.recall_macro),
            description: typeof metrics?.recall_macro === 'number'
              ? `Current result: ${formatPercentage(metrics.recall_macro)} means that, on average across classes, the model successfully finds about ${Math.round(metrics.recall_macro * 100)} out of every 100 true sentiment examples.`
              : 'Current result: Unavailable means macro recall was not returned.',
          },
          {
            label: 'F1-Score (Macro)',
            value: formatPercentage(metrics?.f1_macro),
            description: typeof metrics?.f1_macro === 'number'
              ? `Current result: ${formatPercentage(metrics.f1_macro)} is the balanced combined score for precision and recall across the classes, so it summarizes overall classification quality in one number.`
              : 'Current result: Unavailable means macro F1-score was not returned.',
          },
        ],
      },
    } : {}),
    ...(report ? {
      perClass: {
        title: 'Per-Class Performance',
        description: 'This table breaks the results down by sentiment label so you can compare how well the model handles negative, neutral, and positive reviews.',
        items: [
          {
            label: 'Classes Shown',
            value: classOrder,
            description: `Current result: the table reports separate scores for these sentiment classes: ${classOrder}.`,
          },
          {
            label: 'Precision',
            value: 'Per class',
            description: 'Read this per row: if a class has 90% precision, that means 90 out of 100 reviews predicted as that sentiment were actually correct.',
          },
          {
            label: 'Recall',
            value: 'Per class',
            description: 'Read this per row: if a class has 80% recall, that means the model found 80 out of 100 reviews that truly belong to that sentiment.',
          },
          {
            label: 'F1-Score',
            value: 'Per class',
            description: 'Read this per row: the F1-score combines precision and recall into one score, so higher values mean a better balance between correctness and coverage.',
          },
          {
            label: 'Support',
            value: 'Row count',
            description: 'Current result: support is the number of test reviews that truly belong to each row’s class. A larger support count means that row’s metrics are based on more examples.',
          },
        ],
      },
    } : {}),
    ...(confusionMatrix.length > 0 && classLabels.length > 0 ? {
      confusion: {
        title: 'Confusion Matrix',
        description: 'This matrix shows where the model was correct and where it confused one sentiment with another.',
        items: [
          {
            label: 'Matrix Layout',
            value: 'Rows = actual, columns = predicted',
            description: 'Current result: each row starts from the true sentiment, and each column shows what the model predicted for those reviews.',
          },
          {
            label: 'Diagonal Cells',
            value: formatCount(diagonalCount),
            description: totalMatrixCount > 0
              ? `Current result: ${formatCount(diagonalCount)} predictions fall on the diagonal, meaning they were correct. That is ${formatPercentage(diagonalCount / totalMatrixCount)} of all matrix entries.`
              : 'Current result: no confusion-matrix totals were available.',
          },
          {
            label: 'Off-Diagonal Cells',
            value: formatCount(Math.max(totalMatrixCount - diagonalCount, 0)),
            description: totalMatrixCount > 0
              ? `Current result: ${formatCount(Math.max(totalMatrixCount - diagonalCount, 0))} predictions are off the diagonal, meaning the model confused one sentiment with another in those cases.`
              : 'Current result: no confusion-matrix totals were available.',
          },
          {
            label: 'Class Order',
            value: classOrder,
            description: `Current result: both axes use this same class order: ${classOrder}. Compare rows and columns using that sequence.`,
          },
        ],
      },
    } : {}),
  };

  const activeGuide = activeGuideKey ? guideSections[activeGuideKey] : null;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="model-info-header">
        <Info size={20} style={{ color: 'var(--accent)' }} />
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Model Information</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Trained sentiment classification model details and performance metrics.
          </p>
        </div>
      </div>

      <div className="card">
        <CardSectionHeader title="System Status" guideKey="system" activeGuideKey={activeGuideKey} onOpenGuide={setActiveGuideKey} />
        <div className="card-body">
          <div className="grid grid-2">
            <StatusRow
              ok={health?.status === 'ok'}
              label="API Server"
              detail={health?.status === 'ok' ? 'Running' : 'Offline'}
            />
            <StatusRow
              ok={health?.model_loaded}
              label="Sentiment Model"
              detail={health?.model_loaded ? 'Loaded' : 'Not loaded'}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <CardSectionHeader title="Model Details" guideKey="details" activeGuideKey={activeGuideKey} onOpenGuide={setActiveGuideKey} />
        <div className="card-body">
          <div className="grid grid-2" style={{ gap: 12 }}>
            <DetailItem label="Model Type" value={modelData?.model_type} />
            <DetailItem label="Training Size" value={formatReviewCount(metrics?.train_size)} />
            <DetailItem label="Test Size" value={formatReviewCount(metrics?.test_size)} />
            <DetailItem label="Aspect Categories" value={formatList(modelData?.aspect_categories)} />
          </div>
        </div>
      </div>

      {metrics && (
        <div className="card">
          <CardSectionHeader title="Overall Performance" guideKey="overall" activeGuideKey={activeGuideKey} onOpenGuide={setActiveGuideKey} />
          <div className="card-body">
            <div className="grid grid-4">
              <MetricCard label="Accuracy" value={metrics.accuracy} />
              <MetricCard label="Precision (Macro)" value={metrics.precision_macro} />
              <MetricCard label="Recall (Macro)" value={metrics.recall_macro} />
              <MetricCard label="F1-Score (Macro)" value={metrics.f1_macro} />
            </div>
          </div>
        </div>
      )}

      {report && (
        <div className="card">
          <CardSectionHeader title="Per-Class Performance" guideKey="perClass" activeGuideKey={activeGuideKey} onOpenGuide={setActiveGuideKey} />
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1-Score</th>
                  <th>Support</th>
                </tr>
              </thead>
              <tbody>
                {['negative', 'neutral', 'positive'].map((cls) => {
                  const data = report[cls];
                  if (!data) return null;
                  return (
                    <tr key={cls}>
                      <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{cls}</td>
                      <td className="mono">{(data.precision * 100).toFixed(1)}%</td>
                      <td className="mono">{(data.recall * 100).toFixed(1)}%</td>
                      <td className="mono">{(data['f1-score'] * 100).toFixed(1)}%</td>
                      <td className="mono">{data.support?.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confusionMatrix.length > 0 && classLabels.length > 0 && (
        <div className="card">
          <CardSectionHeader title="Confusion Matrix" guideKey="confusion" activeGuideKey={activeGuideKey} onOpenGuide={setActiveGuideKey} />
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table" style={{ textAlign: 'center' }}>
              <thead>
                <tr>
                  <th></th>
                  {classLabels.map((label) => (
                    <th key={label} style={{ textTransform: 'capitalize' }}>Pred: {label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {confusionMatrix.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, textTransform: 'capitalize', textAlign: 'left' }}>
                      True: {classLabels[i]}
                    </td>
                    {Array.isArray(row) && row.map((val, j) => {
                      const isCorrect = i === j;
                      return (
                        <td
                          key={j}
                          className="mono"
                          style={{
                            fontWeight: isCorrect ? 700 : 400,
                            color: isCorrect ? 'var(--accent)' : 'var(--text-secondary)',
                            background: isCorrect ? 'var(--bg-hover)' : 'transparent',
                          }}
                        >
                          {val.toLocaleString()}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InfoGuideModal
        activeGuide={activeGuide}
        onClose={() => setActiveGuideKey(null)}
        dialogId="model-info-guide"
      />
    </div>
  );
}

function CardSectionHeader({ title, guideKey, activeGuideKey, onOpenGuide }) {
  return (
    <div className="card-header card-header-with-action">
      <h3>{title}</h3>
      <GuideButton
        label={`Explain ${title}`}
        onClick={() => onOpenGuide(guideKey)}
        expanded={activeGuideKey === guideKey}
        controls="model-info-guide"
      />
    </div>
  );
}

function StatusRow({ ok, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {ok ? (
        <CheckCircle size={16} style={{ color: 'var(--green)' }} />
      ) : (
        <XCircle size={16} style={{ color: 'var(--red)' }} />
      )}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detail}</div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value || 'Unavailable'}</div>
    </div>
  );
}

function MetricCard({ label, value }) {
  const hasValue = typeof value === 'number';
  const pct = hasValue ? `${(value * 100).toFixed(1)}%` : '--';
  const color = !hasValue
    ? 'var(--text-muted)'
    : value >= 0.7
      ? 'var(--green)'
      : value >= 0.5
        ? 'var(--yellow)'
        : 'var(--red)';

  return (
    <div className="metric-card">
      <div className="metric-value mono" style={{ color }}>{pct}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function formatPercentage(value) {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Unavailable';
}

function formatCount(value, suffix = '') {
  return typeof value === 'number' ? `${value.toLocaleString()}${suffix}` : 'Unavailable';
}

function formatReviewCount(value, suffix = ' reviews') {
  return typeof value === 'number' ? `${value.toLocaleString()}${suffix}` : 'Unavailable';
}

function formatList(values) {
  return Array.isArray(values) && values.length ? values.join(', ') : 'Unavailable';
}

function toTitleCase(value) {
  return typeof value === 'string' && value.length
    ? `${value.charAt(0).toUpperCase()}${value.slice(1)}`
    : value;
}

export default ModelInfo;
