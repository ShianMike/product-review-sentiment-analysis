import axios from 'axios';

/**
 * Central HTTP client for the React frontend.
 *
 * Visualization data does not come from many separate endpoints. Instead, the
 * dashboard mainly depends on one analysis workflow:
 * 1) upload a file and ask the backend to start a background analysis job
 * 2) poll the job-status endpoint until the backend finishes processing
 * 3) receive one consolidated result object containing all chart/table payloads
 * 4) pass that object into dashboard components for rendering
 *
 * Project.txt link:
 * - System Architecture 7.1 requires React-to-Flask REST communication.
 * - Functional Requirement 7.2 includes async analysis, exports, saved
 *   projects, product drill-down, full reviews, prediction, and model info.
 * Keeping these calls here makes that contract explicit and keeps components
 * focused on UI state rather than URL construction.
 */
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5 minutes for large file processing
});

export const healthCheck = () => api.get('/api/health');

export const getModelInfo = () => api.get('/api/model-info');

/**
 * Older synchronous analysis endpoint.
 *
 * The app mostly uses the async job flow below because full review analysis can
 * take time and we want progress feedback instead of a single long-running
 * request that leaves the UI idle.
 */
export const analyzeFile = (file, textColumn = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (textColumn) {
    formData.append('text_column', textColumn);
  }
  return api.post('/api/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Step 1 of the async visualization pipeline.
 *
 * Sends the uploaded dataset to the backend and asks it to create a background
 * analysis job. The immediate response only contains job metadata such as the
 * job ID, not the final visualization data.
 */
export const startAnalyzeJob = (file, textColumn = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (textColumn) {
    formData.append('text_column', textColumn);
  }
  return api.post('/api/analyze/start', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Step 2 of the async visualization pipeline.
 *
 * Polls the backend for job progress. Once the job is complete, the response
 * includes the final `result` object. That single result contains the
 * pre-aggregated data for sentiment charts, aspect charts, theme cards, trend
 * charts, exports, and any optional review/product views.
 */
export const getAnalyzeJobStatus = (jobId) => {
  return api.get(`/api/analyze/status/${jobId}`);
};

export const predictSingle = (text) => {
  return api.post('/api/predict', { text });
};

// Export helpers post already-fetched dashboard payloads back to the backend so
// files can be generated and downloaded without recomputing the analysis.
export const exportJson = (data) => {
  return api.post('/api/export-json', data);
};

export const exportAspectsJson = (data) => {
  return api.post('/api/export-aspects/json', data);
};

export const exportAspectsCsv = (data) => {
  return api.post('/api/export-aspects/csv', data);
};

// Convert a backend export filename into a direct download URL.
export const getExportUrl = (filename) => {
  return `${API_BASE}/api/export/${filename}`;
};

/**
 * Fetch aspect and theme data filtered to a single product.
 *
 * The backend re-aggregates from the exported CSV on the fly so the initial
 * analysis response stays lean without per-product breakdowns.
 */
export const getProductAnalysis = (exportFile, productId) => {
  return api.get('/api/product-analysis', {
    params: { file: exportFile, product_id: productId },
  });
};

export const getReviews = (exportFile, productId = 'all') => {
  return api.get('/api/reviews', {
    params: { file: exportFile, product_id: productId },
  });
};

// Saved-project helpers fulfill the backend persistence requirement in
// Project.txt Functional Requirement 7.2.
export const getProjects = () => api.get('/api/projects');

export const getProject = (projectId) => api.get(`/api/projects/${projectId}`);

export const deleteProject = (projectId) => api.delete(`/api/projects/${projectId}`);

export const cleanupGeneratedFiles = () => api.post('/api/storage/cleanup');

export default api;
