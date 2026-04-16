import { render, screen } from '@testing-library/react';
import App from './App';

test('renders navigation and upload view', () => {
  render(<App />);
  expect(screen.getByText(/ReviewLens/i)).toBeInTheDocument();
  expect(screen.getByText(/Upload & Analyze/i)).toBeInTheDocument();
  expect(screen.getByText(/Upload Product Reviews/i)).toBeInTheDocument();
});

test('keeps Dashboard tab disabled before analysis data is available', () => {
  render(<App />);
  const dashboardTab = screen.getByRole('button', { name: /Dashboard/i });
  expect(dashboardTab).toBeDisabled();
});
