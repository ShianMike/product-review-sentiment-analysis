import unittest

from backend._3_sentiment import calibrate_single_prediction, get_rule_based_sentiment


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

    def test_negated_positive_language_is_negative_rule_signal(self):
        label, strength = get_rule_based_sentiment(
            'This was not good value and not worth the money. Never buy again.'
        )

        self.assertEqual(label, 'negative')
        self.assertGreaterEqual(strength, 0.9)

    def test_strong_negation_can_override_high_confidence_positive_model_output(self):
        adjusted = calibrate_single_prediction(
            'This was not good value and not worth the money. Never buy again.',
            {
                'negative': 0.02,
                'neutral': 0.03,
                'positive': 0.95,
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

    def test_mixed_text_can_override_overconfident_positive_model_output(self):
        adjusted = calibrate_single_prediction(
            "It's okay, nothing special. The price is reasonable but the taste could be better.",
            {
                'negative': 0.001135794968682787,
                'neutral': 0.0025736998434741066,
                'positive': 0.9962905051878431,
            },
        )

        self.assertEqual(max(adjusted, key=adjusted.get), 'neutral')

    def test_strong_positive_text_keeps_high_confidence_positive_prediction(self):
        adjusted = calibrate_single_prediction(
            'This product is amazing! Great quality and fast delivery. Worth every penny.',
            {
                'negative': 0.01,
                'neutral': 0.02,
                'positive': 0.97,
            },
        )

        self.assertEqual(max(adjusted, key=adjusted.get), 'positive')


if __name__ == '__main__':
    unittest.main()
