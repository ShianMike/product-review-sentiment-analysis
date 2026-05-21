import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FileUpload from '../components/_3_FileUpload';
import { cleanupGeneratedFiles, deleteProject, getProject, getProjects } from '../_1_api';

jest.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

jest.mock('../_1_api', () => ({
  startAnalyzeJob: jest.fn(),
  getAnalyzeJobStatus: jest.fn(),
  getProjects: jest.fn(),
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  cleanupGeneratedFiles: jest.fn(),
}));

function renderFileUpload(overrides = {}) {
  const props = {
    onAnalysisComplete: jest.fn(),
    isLoading: false,
    setIsLoading: jest.fn(),
    ...overrides,
  };
  render(<FileUpload {...props} />);
  return props;
}

describe('FileUpload saved projects', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    getProjects.mockResolvedValue({
      data: {
        projects: [
          {
            id: 'project-1',
            title: 'Walmart Reviews',
            filename: 'walmart.csv',
            total_reviews: 120,
            created_at: '2026-05-15T01:00:00Z',
            positive_pct: 70,
            negative_pct: 12.5,
          },
        ],
      },
    });
  });

  test('loads a backend saved project into the dashboard', async () => {
    getProject.mockResolvedValue({
      data: {
        project: {
          result: {
            filename: 'walmart.csv',
            total_reviews: 120,
            sentiment_distribution: {},
          },
        },
      },
    });
    const view = renderFileUpload();

    expect(await screen.findByText('Saved Projects')).toBeInTheDocument();
    expect(screen.queryByText('Recent Files')).not.toBeInTheDocument();
    expect(await screen.findByText('Walmart Reviews')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Load$/i }));

    await waitFor(() => expect(getProject).toHaveBeenCalledWith('project-1'));
    expect(view.onAnalysisComplete).toHaveBeenCalledWith(expect.objectContaining({ filename: 'walmart.csv' }));
  });

  test('deletes a backend saved project from the list', async () => {
    deleteProject.mockResolvedValue({ data: { status: 'success' } });
    renderFileUpload();

    expect(await screen.findByText('Walmart Reviews')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Delete saved project/i));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('project-1'));
    await waitFor(() => expect(screen.queryByText('Walmart Reviews')).not.toBeInTheDocument());
  });

  test('shows a friendly saved-projects unavailable message', async () => {
    getProjects.mockRejectedValue(new Error('Network Error'));
    renderFileUpload();

    expect(await screen.findByText('Saved projects are unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Files')).not.toBeInTheDocument();
  });

  test('runs generated-file cleanup from the saved projects panel', async () => {
    cleanupGeneratedFiles.mockResolvedValue({ data: { message: 'Storage cleanup completed.' } });
    renderFileUpload();

    expect(await screen.findByText('Walmart Reviews')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clean generated files/i }));

    await waitFor(() => expect(cleanupGeneratedFiles).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Storage cleanup completed.')).toBeInTheDocument();
  });
});
