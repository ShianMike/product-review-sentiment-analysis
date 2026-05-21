import unittest

import pandas as pd

from backend._2_preprocessing import preprocess_uploaded_file


class PreprocessingUploadTests(unittest.TestCase):
    def test_prefers_longer_summary_when_review_is_short(self):
        df = pd.DataFrame({
            'Review': ['Good', 'Bad'],
            'Summary': [
                'This product has excellent battery quality and arrived quickly',
                'The package arrived broken and the quality was disappointing',
            ],
            'Score': [5, 1],
            'ProductId': ['A', 'B'],
        })

        processed = preprocess_uploaded_file(df)

        self.assertIn('summary', processed.columns)
        self.assertIn('product_id', processed.columns)
        self.assertEqual(processed.loc[0, 'original_text'], df.loc[0, 'Summary'])
        self.assertEqual(processed.loc[0, 'summary'], 'Good')
        self.assertEqual(processed.loc[0, 'product_id'], 'A')
        self.assertIn('sentiment_label', processed.columns)

    def test_falls_back_to_first_string_column_when_alias_missing(self):
        df = pd.DataFrame({
            'Notes': ['Excellent sturdy product', 'Terrible broken product'],
            'Stars': [5, 1],
        })

        processed = preprocess_uploaded_file(df)

        self.assertEqual(processed['original_text'].tolist(), df['Notes'].tolist())
        self.assertEqual(processed['rating'].tolist(), [5, 1])

    def test_raises_when_no_text_column_can_be_detected(self):
        df = pd.DataFrame({
            'Score': [5, 4],
            'Timestamp': [1711929600, 1712016000],
        })

        with self.assertRaises(ValueError):
            preprocess_uploaded_file(df)


if __name__ == '__main__':
    unittest.main()
