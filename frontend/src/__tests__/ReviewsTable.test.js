import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReviewsTable from '../components/dashboard/_12_ReviewsTable';
import { getReviews } from '../_1_api';

jest.mock('../_1_api', () => ({
  getReviews: jest.fn(),
}));

const reviews = [
  {
    text: 'Great quality and fast shipping',
    summary: 'Excellent item',
    product_id: 'A',
    predicted_sentiment: 'positive',
    confidence: 0.94,
    rating: 5,
    date: '2026-01-05',
    aspects: { quality: { label: 'positive' }, delivery: { label: 'positive' } },
  },
  {
    text: 'Broken package and terrible support',
    summary: 'Bad service',
    product_id: 'B',
    predicted_sentiment: 'negative',
    confidence: 0.87,
    rating: 1,
    date: '2026-02-10',
    aspects: { delivery: { label: 'negative' }, service: { label: 'negative' } },
  },
  {
    text: 'Average product for the price',
    summary: 'Okay value',
    product_id: 'A',
    predicted_sentiment: 'neutral',
    confidence: 0.63,
    rating: 3,
    date: '2026-03-12',
    aspects: { price: { label: 'neutral' } },
  },
];

function makeData(overrides = {}) {
  return {
    total_reviews: reviews.length,
    reviews,
    export_file: '',
    product_summary: {
      top_products: [
        { product_id: 'A', total_reviews: 2 },
        { product_id: 'B', total_reviews: 1 },
      ],
    },
    theme_summary: {
      overall_keywords: [['quality', 1], ['support', 1]],
      overall_phrases: [['fast shipping', 1]],
      themes_by_sentiment: {},
      complaints_and_praises: {},
      word_clouds: {},
    },
    ...overrides,
  };
}

describe('ReviewsTable', () => {
  beforeEach(() => {
    getReviews.mockReset();
  });

  test('filters reviews by sentiment, search, theme, and date range', () => {
    render(<ReviewsTable data={makeData()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Negative' }));
    expect(screen.getByText(/Broken package/i)).toBeInTheDocument();
    expect(screen.queryByText(/Great quality/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByPlaceholderText(/Search review text/i), { target: { value: 'average' } });
    expect(screen.getByText(/Average product/i)).toBeInTheDocument();
    expect(screen.queryByText(/Broken package/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search review text/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Filter reviews by keyword or theme/i), { target: { value: 'quality' } });
    expect(screen.getByText(/Great quality/i)).toBeInTheDocument();
    expect(screen.queryByText(/Average product/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filter reviews by keyword or theme/i), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText(/Start date/i), { target: { value: '2026-02-01' } });
    expect(screen.getByText(/Broken package/i)).toBeInTheDocument();
    expect(screen.getByText(/Average product/i)).toBeInTheDocument();
    expect(screen.queryByText(/Great quality/i)).not.toBeInTheDocument();
  });

  test('opens and closes the review detail modal', () => {
    render(<ReviewsTable data={makeData()} />);

    fireEvent.click(screen.getByText(/Great quality and fast shipping/i));

    const dialog = screen.getByRole('dialog', { name: /Review Details/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Excellent item/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/quality: positive/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Close review details/i));
    expect(screen.queryByRole('dialog', { name: /Review Details/i })).not.toBeInTheDocument();
  });

  test('loads product-scoped reviews from the backend export', async () => {
    getReviews
      .mockResolvedValueOnce({ data: { reviews, total_reviews: reviews.length } })
      .mockResolvedValueOnce({ data: { reviews: [reviews[0], reviews[2]], total_reviews: 2 } });

    render(<ReviewsTable data={makeData({ export_file: 'processed_reviews.csv' })} />);

    await waitFor(() => expect(getReviews).toHaveBeenCalledWith('processed_reviews.csv', 'all'));

    fireEvent.change(screen.getByLabelText(/Filter reviews by product/i), { target: { value: 'A' } });

    await waitFor(() => expect(getReviews).toHaveBeenCalledWith('processed_reviews.csv', 'A'));
    await waitFor(() => expect(screen.queryByText(/Broken package/i)).not.toBeInTheDocument());
    expect(screen.getByText(/Great quality/i)).toBeInTheDocument();
    expect(screen.getByText(/Average product/i)).toBeInTheDocument();
  });
});
