import { render, screen } from '@testing-library/react';
import App from './App';
import { getProjects } from './_1_api';

jest.mock('./_1_api', () => ({
  healthCheck: jest.fn(),
  getModelInfo: jest.fn(),
  startAnalyzeJob: jest.fn(),
  getAnalyzeJobStatus: jest.fn(),
  predictSingle: jest.fn(),
  exportJson: jest.fn(),
  exportAspectsJson: jest.fn(),
  exportAspectsCsv: jest.fn(),
  getExportUrl: jest.fn((filename) => `/api/export/${filename}`),
  getProductAnalysis: jest.fn(),
  getReviews: jest.fn(),
  getProjects: jest.fn(),
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  cleanupGeneratedFiles: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getProjects.mockResolvedValue({
    data: {
      projects: [
        {
          id: 'project-1',
          title: 'Saved Demo Project',
          filename: 'reviews.csv',
          total_reviews: 25,
          created_at: '2026-05-15T01:00:00Z',
          positive_pct: 64,
          negative_pct: 16,
        },
      ],
    },
  });
});

test('renders navigation and upload view', async () => {
  render(<App />);
  expect(screen.getByText(/ReviewLens/i)).toBeInTheDocument();
  expect(screen.getByText(/Upload & Analyze/i)).toBeInTheDocument();
  expect(screen.getByText(/Upload Product Reviews/i)).toBeInTheDocument();
  expect(await screen.findByText('Saved Demo Project')).toBeInTheDocument();
});

test('keeps Dashboard tab disabled before analysis data is available', async () => {
  render(<App />);
  const dashboardTab = screen.getByRole('button', { name: /Dashboard/i });
  expect(dashboardTab).toBeDisabled();
  expect(await screen.findByText('Saved Demo Project')).toBeInTheDocument();
});
