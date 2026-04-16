import unittest

from backend.sentiment import calibrate_single_prediction


class SentimentCalibrationTests(unittest.TestCase):
    def test_strong_positive_text_overrides_noisy_negative_distribution(self):
        adjusted = calibrate_single_prediction(
            'This product is amazing! Great quality and fast delivery.',
            {
                'negative': 0.6615354483027004,
                'neutral': 0.02409188286646295,
                'positive': 0.31437266883083664,
            },
        )

        self.assertEqual(max(adjusted, key=adjusted.get), 'positive')

    def test_strong_negative_text_overrides_noisy_positive_distribution(self):
        adjusted = calibrate_single_prediction(
            'Terrible quality, broke after one week. Customer service was unhelpful. Would not recommend.',
            {
                'negative': 0.14,
                'neutral': 0.12,
                'positive': 0.74,
            },
        )

        self.assertEqual(max(adjusted, key=adjusted.get), 'negative')

    def test_mixed_text_keeps_neutral_distribution(self):
        adjusted = calibrate_single_prediction(
            "It's okay, nothing special. The price is reasonable but the taste could be better.",
            {
                'negative': 0.30698321395986494,
                'neutral': 0.5704719258461496,
                'positive': 0.12254486019398547,
            },
        )

        self.assertEqual(max(adjusted, key=adjusted.get), 'neutral')


if __name__ == '__main__':
    unittest.main()
