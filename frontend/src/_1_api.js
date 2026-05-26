import axios from 'axios';

/**
 * Central HTTP client for the React frontend.
 *
 * This file is the frontend's list of backend calls. Components import these
 * functions instead of writing endpoint URLs manually.
 *
 * Main dashboard flow:
 * 1) upload a file and start a backend analysis job
 * 2) poll the job-status endpoint until processing is complete
 * 3) receive one result object with chart/table data
 * 4) pass that result object into dashboard components for rendering
 */
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5 minutes for large file processing
});

export const healthCheck = () => api.get('/api/health');

export const getModelInfo = () => api.get('/api/model-info');

/**
 * Run analysis in one blocking request.
 *
 * The app mostly uses the async job flow below, but this function remains
 * useful for small files or quick development checks.
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
 * Step 1 of async analysis.
 *
 * Send the uploaded dataset to the backend and ask it to create a background
 * job. The response returns a job ID, not the final dashboard data yet.
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
 * Step 2 of async analysis.
 *
 * Ask the backend for job progress. When the job is complete, the response
 * includes `result`, which contains the dashboard data.
 */
export const getAnalyzeJobStatus = (jobId) => {
  return api.get(`/api/analyze/status/${jobId}`);
};

export const predictSingle = (text) => {
  return api.post('/api/predict', { text });
};

// JSON export helper.
// The frontend sends the dashboard summary to the backend. The backend saves it
// as a JSON file and sends back the filename.
export const exportJson = (data) => {
  return api.post('/api/export-json', data);
};

export const exportAspectsJson = (data) => {
  return api.post('/api/export-aspects/json', data);
};

export const exportAspectsCsv = (data) => {
  return api.post('/api/export-aspects/csv', data);
};

// Download URL helper.
// The backend gives only a filename, so this builds the full URL that the
// browser can open to download the CSV or JSON file.
export const getExportUrl = (filename) => {
  return `${API_BASE}/api/export/${filename}`;
};

/**
 * Fetch aspect and theme data for one selected product.
 *
 * The backend reads the saved processed export and builds product-specific
 * summaries only when the user needs them.
 */
export const getProductAnalysis = (exportFile, productId) => {
  return api.get('/api/product-analysis', {
    params: { file: exportFile, product_id: productId },
  });
};

// Load review rows from the saved processed export. This is used by the Reviews
// tab so it can work with all rows, not only the capped dashboard sample.
export const getReviews = (exportFile, productId = 'all') => {
  return api.get('/api/reviews', {
    params: { file: exportFile, product_id: productId },
  });
};

// Saved-project helpers let users load or delete previous analysis results.
export const getProjects = () => api.get('/api/projects');

export const getProject = (projectId) => api.get(`/api/projects/${projectId}`);

export const deleteProject = (projectId) => api.delete(`/api/projects/${projectId}`);

export const cleanupGeneratedFiles = () => api.post('/api/storage/cleanup');

export default api;
