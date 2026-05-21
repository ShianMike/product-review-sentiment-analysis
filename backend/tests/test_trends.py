import unittest

import pandas as pd

from backend._8_trends import build_monthly_trends
from backend._9_product_summary import build_product_trends


class TrendTests(unittest.TestCase):
    def test_monthly_trends_aggregate_counts_and_percentages(self):
        df = pd.DataFrame({
            'date': pd.to_datetime(['2026-01-01', '2026-01-15', '2026-02-01']),
            'sentiment_label': ['positive', 'negative', 'positive'],
        })

        trends = build_monthly_trends(df, 'sentiment_label')

        self.assertEqual(len(trends), 2)
        self.assertEqual(trends[0]['month'], '2026-01')
        self.assertEqual(trends[0]['total'], 2)
        self.assertEqual(trends[0]['positive_pct'], 50.0)
        self.assertEqual(trends[1]['positive'], 1)

    def test_monthly_trends_return_none_for_unparseable_date_series(self):
        df = pd.DataFrame({
            'date': ['not-a-date'],
            'sentiment_label': ['neutral'],
        })

        self.assertIsNone(build_monthly_trends(df, 'sentiment_label'))

    def test_product_trends_coerce_string_dates_and_drop_invalid_rows(self):
        df = pd.DataFrame({
            'product_id': ['A', 'A', 'B', 'B'],
            'date': ['2026-01-05', 'invalid', '2026-02-01', '2026-02-15'],
            'sentiment_label': ['positive', 'negative', 'negative', 'neutral'],
        })

        trends = build_product_trends(df, 'sentiment_label')

        self.assertEqual(trends['product_ids'], ['B', 'A'])
        self.assertEqual(trends['products']['A'][0]['month'], '2026-01')
        self.assertEqual(trends['products']['B'][0]['negative'], 1)
        self.assertEqual(trends['products']['B'][0]['neutral'], 1)


if __name__ == '__main__':
    unittest.main()
