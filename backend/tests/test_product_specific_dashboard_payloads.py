import unittest

import pandas as pd

from backend._7_themes import generate_theme_summary
from backend._9_product_summary import build_product_summary


class ProductSpecificDashboardPayloadTests(unittest.TestCase):
    def test_product_summary_contains_per_product_distribution_and_attention_signal(self):
        df = pd.DataFrame([
            {'product_id': 'A', 'sentiment_label': 'negative', 'rating': 1},
            {'product_id': 'A', 'sentiment_label': 'negative', 'rating': 2},
            {'product_id': 'A', 'sentiment_label': 'neutral', 'rating': 3},
            {'product_id': 'A', 'sentiment_label': 'positive', 'rating': 4},
            {'product_id': 'A', 'sentiment_label': 'negative', 'rating': 2},
            {'product_id': 'B', 'sentiment_label': 'positive', 'rating': 5},
            {'product_id': 'B', 'sentiment_label': 'positive', 'rating': 5},
            {'product_id': 'B', 'sentiment_label': 'neutral', 'rating': 4},
            {'product_id': 'B', 'sentiment_label': 'positive', 'rating': 5},
            {'product_id': 'B', 'sentiment_label': 'positive', 'rating': 5},
        ])

        summary = build_product_summary(df, 'sentiment_label')
        product_a = next(item for item in summary['top_products'] if item['product_id'] == 'A')

        self.assertEqual(product_a['total_reviews'], 5)
        self.assertEqual(product_a['sentiment_summary']['negative']['count'], 3)
        self.assertEqual(product_a['sentiment_summary']['negative']['percentage'], 60.0)
        self.assertEqual(product_a['attention_level'], 'High')
        self.assertEqual(summary['needs_attention_product']['product_id'], 'A')

    def test_theme_summary_builds_separate_praise_and_complaint_word_clouds(self):
        texts = [
            'great battery great screen smooth',
            'great quality smooth setup',
            'broken battery broken charger not good slow',
            'not good screen slow support',
        ]
        labels = ['positive', 'positive', 'negative', 'negative']

        summary = generate_theme_summary(texts=texts, sentiment_labels=labels, processed_texts=texts)
        praise_words = {item['text'] for item in summary['word_clouds']['praises']}
        complaint_words = {item['text'] for item in summary['word_clouds']['complaints']}

        self.assertIn('great', praise_words)
        self.assertIn('broken', complaint_words)
        self.assertIn('not good', complaint_words)
        self.assertNotIn('broken', praise_words)
        self.assertNotIn('great', complaint_words)
        self.assertNotIn('good', complaint_words)


if __name__ == '__main__':
    unittest.main()
