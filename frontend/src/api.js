import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5 minutes for large file processing
});

export const healthCheck = () => api.get('/api/health');

export const getModelInfo = () => api.get('/api/model-info');

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

export const getAnalyzeJobStatus = (jobId) => {
  return api.get(`/api/analyze/status/${jobId}`);
};

export const predictSingle = (text) => {
  return api.post('/api/predict', { text });
};

export const exportJson = (data) => {
  return api.post('/api/export-json', data);
};

export const exportAspectsJson = (data) => {
  return api.post('/api/export-aspects/json', data);
};

export const exportAspectsCsv = (data) => {
  return api.post('/api/export-aspects/csv', data);
};

export const getExportUrl = (filename) => {
  return `${API_BASE}/api/export/${filename}`;
};

export default api;
