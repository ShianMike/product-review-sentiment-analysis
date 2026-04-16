import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { startAnalyzeJob, getAnalyzeJobStatus } from '../api';

/**
 * FileUpload owns the async fetch workflow that eventually powers the dashboard.
 *
 * High-level data flow:
 * 1) user selects a CSV/XLS/XLSX file
 * 2) frontend uploads it with startAnalyzeJob(...)
 * 3) backend returns a job ID immediately
 * 4) frontend polls getAnalyzeJobStatus(jobId)
 * 5) when status becomes "completed", the backend includes `job.result`
 * 6) that result object is handed to App via onAnalysisComplete(...)
 * 7) App stores it and renders <Dashboard data={analysisData} />
 *
 * This means the visualization components themselves do not fetch data. They
 * only receive the already-prepared analysis payload returned by this flow.
 */
function FileUpload({ onAnalysisComplete, isLoading, setIsLoading }) {
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);

  // react-dropzone gives us accepted and rejected files. We keep validation
  // lightweight here because the backend still performs the real file checks.
  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError(null);
    if (rejectedFiles.length > 0) {
      setError('Invalid file type. Please upload a CSV or Excel file.');
      return;
    }
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    multiple: false,
  });

  /**
   * Start the backend job, then poll until the final analysis payload arrives.
   *
   * Why polling is used:
   * - large review files can take time to preprocess and analyze
   * - backend needs time to build all chart-ready aggregates
   * - progress updates make the UI feel responsive during long analysis runs
   *
   * The final result returned by the backend already contains visualization data
   * such as sentiment distribution, aspect summaries, themes, trends, exports,
   * and optional product/reviews payloads.
   */
  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);
    setProgress('Uploading file and starting analysis...');
    setProgressStage('Uploading');
    setProgressPercent(0);

    try {
      // First request: upload the raw file and ask backend to queue analysis.
      const startResponse = await startAnalyzeJob(selectedFile);
      const jobId = startResponse.data?.job_id;

      if (!jobId) {
        throw new Error('Unable to start analysis job. Please try again.');
      }

      setProgress('Upload complete. Initializing analysis pipeline...');
      setProgressStage('Queued');
      setProgressPercent(5);

      const maxPollCycles = 900; // ~15 minutes at 1-second intervals
      for (let pollCount = 0; pollCount < maxPollCycles; pollCount += 1) {
        // Follow-up request: ask the backend where the job currently is.
        const statusResponse = await getAnalyzeJobStatus(jobId);
        const job = statusResponse.data || {};

        // Reflect backend progress messages directly in the upload UI so users
        // can see whether preprocessing, sentiment inference, theme extraction,
        // or export generation is currently running.
        if (typeof job.progress === 'number') {
          setProgressPercent(Math.max(0, Math.min(100, Math.round(job.progress))));
        }
        setProgressStage(job.stage || 'Processing');
        setProgress(job.message || 'Processing uploaded reviews...');

        if (job.status === 'completed') {
          setProgressPercent(100);
          setProgressStage('Completed');
          setProgress('Analysis complete!');
          // This callback is the handoff point from "fetching" to "visualizing".
          // job.result is the single payload later consumed by Dashboard.
          onAnalysisComplete(job.result);
          return;
        }

        if (job.status === 'failed') {
          throw new Error(job.error || 'Analysis failed');
        }

        // Poll once per second to balance responsiveness and backend load.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      throw new Error('Analysis timed out. Please try again with a smaller file.');
    } catch (err) {
      // Normalize backend or network errors into one user-facing message.
      const message = err.response?.data?.error || err.message || 'Analysis failed';
      setError(message);
      setProgress('');
      setProgressStage('');
      setProgressPercent(0);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Upload Product Reviews
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Upload a CSV or Excel file containing product reviews to analyze sentiment,
          extract themes, and generate insights.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${selectedFile ? 'has-file' : ''}`}
      >
        <input {...getInputProps()} />
        {selectedFile ? (
          <>
            <CheckCircle2 size={32} style={{ color: 'var(--green)', marginBottom: 12 }} />
            <div className="dropzone-title">{selectedFile.name}</div>
            <div className="dropzone-sub mono">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
            <div className="dropzone-sub" style={{ marginTop: 8 }}>Click or drop to change file</div>
          </>
        ) : (
          <>
            <Upload size={32} className="dropzone-icon" />
            <div className="dropzone-title">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your review file'}
            </div>
            <div className="dropzone-sub">or click to browse — CSV, XLSX supported</div>
          </>
        )}
      </div>

      {/* Requirements */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <FileText size={14} />
          <h3>File Requirements</h3>
        </div>
        <div className="card-body" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {/* Demo guide: this card helps explain required vs optional dataset fields. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>• <strong>Required:</strong> A column containing review text (auto-detected)</span>
            <span>• <strong>Optional:</strong> Rating/Score, Date/Time, Product ID, Summary columns</span>
            <span>• Maximum ~50,000 reviews processed per upload</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Progress */}
      {(progress || isLoading) && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div className="section-label" style={{ marginBottom: 0 }}>Analysis Progress</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{progressPercent}%</div>
            </div>

            <div
              className="bar-track"
              style={{ height: 8 }}
              role="progressbar"
              aria-label="Analysis progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div className="bar-fill bar-fill-accent" style={{ width: `${progressPercent}%` }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              {isLoading && <Loader2 size={14} className="spin" style={{ flexShrink: 0 }} />}
              <span>
                {progressStage ? `${progressStage}: ` : ''}
                {progress || 'Waiting for status updates...'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!selectedFile || isLoading}
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 16, padding: '12px 16px', fontSize: 13 }}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="spin" />
            Analyzing...
          </>
        ) : (
          'Analyze Reviews'
        )}
      </button>
    </div>
  );
}

export default FileUpload;
