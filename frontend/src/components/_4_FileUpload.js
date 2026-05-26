import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Database, Calendar, FolderOpen, Trash2 } from 'lucide-react';
import { startAnalyzeJob, getAnalyzeJobStatus, getProjects, getProject, deleteProject, cleanupGeneratedFiles } from '../_1_api';

// Upload workflow component:
// users submit CSV/XLS/XLSX review files, watch analysis progress, and manage
// backend-saved projects.

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown size';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatHistoryDate(value) {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

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
 *
 * In simple terms: this component gets the file to the backend, waits for the
 * backend to finish, then hands the final result to the dashboard.
 */
function FileUpload({ onAnalysisComplete, isLoading, setIsLoading }) {
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [serverProjects, setServerProjects] = useState([]);
  const [serverProjectsError, setServerProjectsError] = useState('');
  const [loadingProjectId, setLoadingProjectId] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [isCleaningStorage, setIsCleaningStorage] = useState(false);
  const [storageCleanupMessage, setStorageCleanupMessage] = useState('');

  const loadServerProjects = useCallback(async () => {
    // Load saved analysis projects so users can reopen previous dashboard data.
    try {
      setServerProjectsError('');
      const response = await getProjects();
      setServerProjects(Array.isArray(response.data?.projects) ? response.data.projects : []);
    } catch {
      setServerProjectsError('Saved projects are unavailable right now.');
    }
  }, []);

  useEffect(() => {
    loadServerProjects();
  }, [loadServerProjects]);

  // react-dropzone gives us accepted and rejected files. We keep validation
  // lightweight here because the backend still performs the real file checks.
  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError(null);
    if (rejectedFiles.length > 0) {
      setError('Invalid file type. Please upload a CSV or Excel file.');
      return;
    }
    if (acceptedFiles.length > 0) {
      const nextFile = acceptedFiles[0];
      setSelectedFile(nextFile);
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
   * The final result already contains visualization data such as sentiment
   * distribution, aspects, themes, trends, exports, products, and reviews.
   */
  const runAnalysisForFile = useCallback(async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setIsLoading(true);
    setError(null);
    setProgress('Uploading file and starting analysis...');
    setProgressStage('Uploading');
    setProgressPercent(0);

    try {
      // First request: upload the raw file and ask backend to queue analysis.
      const startResponse = await startAnalyzeJob(file);
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
          // Refresh the saved-projects list before handing off to the dashboard.
          // onAnalysisComplete switches the active tab which unmounts this
          // component, so any state updates called after it are silently dropped.
          await loadServerProjects();
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
  }, [loadServerProjects, onAnalysisComplete, setIsLoading]);

  const handleAnalyze = useCallback(() => {
    // Start analysis for the currently selected file.
    if (!selectedFile) return;
    runAnalysisForFile(selectedFile);
  }, [runAnalysisForFile, selectedFile]);

  const handleLoadServerProject = useCallback(async (project) => {
    // Open a saved project and send its stored result to the dashboard.
    try {
      setServerProjectsError('');
      setStorageCleanupMessage('');
      setLoadingProjectId(project.id);
      const response = await getProject(project.id);
      const result = response.data?.project?.result;
      if (!result) {
        throw new Error('Saved project result is unavailable.');
      }
      onAnalysisComplete(result);
    } catch (err) {
      setServerProjectsError(err.response?.data?.error || 'Unable to load saved project.');
    } finally {
      setLoadingProjectId('');
    }
  }, [onAnalysisComplete]);

  const handleDeleteServerProject = useCallback(async (project) => {
    // Remove a saved project from backend storage and update the visible list.
    try {
      setServerProjectsError('');
      setStorageCleanupMessage('');
      setDeletingProjectId(project.id);
      await deleteProject(project.id);
      setServerProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (err) {
      setServerProjectsError(err.response?.data?.error || 'Unable to delete saved project.');
    } finally {
      setDeletingProjectId('');
    }
  }, []);

  const handleCleanupGeneratedFiles = useCallback(async () => {
    // Ask the backend to remove old generated uploads, exports, and project files.
    try {
      setServerProjectsError('');
      setStorageCleanupMessage('');
      setIsCleaningStorage(true);
      const response = await cleanupGeneratedFiles();
      setStorageCleanupMessage(response.data?.message || 'Generated files cleanup completed.');
      await loadServerProjects();
    } catch (err) {
      setServerProjectsError(err.response?.data?.error || 'Unable to clean generated files.');
    } finally {
      setIsCleaningStorage(false);
    }
  }, [loadServerProjects]);

  return (
    <div className="upload-workspace">
      <section className="upload-primary">
        <div className="upload-intro">
          <h2>
            Upload Product Reviews
          </h2>
          <p>
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
              <div className="dropzone-sub mono">{formatFileSize(selectedFile.size)}</div>
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
        <div className="upload-requirements">
          <div className="upload-requirement-row">
            <span className="upload-requirement-dot" />
            <span><strong>Required:</strong> A column containing review text (auto-detected)</span>
          </div>
          <div className="upload-requirement-row">
            <span className="upload-requirement-dot upload-requirement-dot-optional" />
            <span><strong>Optional:</strong> Rating/Score, Date/Time, Product ID, Summary columns</span>
          </div>
          <div className="upload-requirement-row">
            <span className="upload-requirement-dot upload-requirement-dot-limit" />
            <span>Maximum ~50,000 reviews processed per upload</span>
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
          style={{ width: '100%', padding: '12px 16px', fontSize: 13 }}
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
      </section>

      <aside className="upload-history upload-projects card">
        <div className="card-header">
          <div className="card-header-title-group">
            <Database size={14} />
            <h3>Saved Projects</h3>
          </div>
          <div className="card-header-actions">
            <button
              type="button"
              className="btn btn-secondary upload-projects-cleanup-btn"
              onClick={handleCleanupGeneratedFiles}
              disabled={isLoading || isCleaningStorage}
              aria-label="Clean generated files"
              title="Clean generated upload, export, and saved project files using retention settings"
            >
              {isCleaningStorage ? (
                <Loader2 size={12} className="spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Clean Files
            </button>
          </div>
        </div>
        <div className="card-body upload-history-body">
          {serverProjectsError && (
            <div className="upload-history-error">
              <AlertCircle size={13} />
              <span>{serverProjectsError}</span>
            </div>
          )}

          {!serverProjectsError && storageCleanupMessage && (
            <div className="upload-history-notice">
              <CheckCircle2 size={13} />
              <span>{storageCleanupMessage}</span>
            </div>
          )}

          {!serverProjectsError && (serverProjects.length > 0 ? serverProjects.map((project) => (
              <article key={project.id} className="upload-history-item upload-history-completed">
                <div className="upload-history-top">
                  <div className="upload-history-file">
                    <Database size={14} />
                    <span title={project.title || project.filename}>{project.title || project.filename}</span>
                  </div>
                  <button
                    type="button"
                    className="upload-history-delete-btn"
                    onClick={() => handleDeleteServerProject(project)}
                    disabled={isLoading || deletingProjectId === project.id || loadingProjectId === project.id}
                    title="Delete saved project"
                    aria-label="Delete saved project"
                  >
                    {deletingProjectId === project.id ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>

                <div className="upload-history-meta">
                  <span><FileText size={12} /> {Number(project.total_reviews || 0).toLocaleString()} reviews</span>
                  <span><Calendar size={12} /> {formatHistoryDate(project.created_at)}</span>
                </div>
                <div className="upload-history-sub">
                  {formatProjectSentiment(project)}
                </div>
                <div className="upload-history-actions">
                  <button
                    type="button"
                    className="btn btn-secondary upload-history-action"
                    onClick={() => handleLoadServerProject(project)}
                    disabled={isLoading || loadingProjectId === project.id || deletingProjectId === project.id}
                  >
                    {loadingProjectId === project.id ? (
                      <>
                        <Loader2 size={13} className="spin" />
                        Loading
                      </>
                    ) : (
                      <>
                        <FolderOpen size={13} />
                        Load
                      </>
                    )}
                  </button>
                </div>
              </article>
            )) : (
            <div className="upload-history-empty">
              Completed analyses will appear here.
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function formatProjectSentiment(project) {
  // Small summary text used in each saved-project card.
  return `${Number(project.positive_pct || 0).toFixed(1)}% positive • ${Number(project.negative_pct || 0).toFixed(1)}% negative`;
}

export default FileUpload;
