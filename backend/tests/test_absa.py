import unittest
from unittest.mock import PropertyMock, patch

from backend._4_absa import analyze_aspects, detect_aspects
from textblob.exceptions import MissingCorpusError


class ABSATests(unittest.TestCase):
    def test_boundary_matching_avoids_substring_false_positive(self):
        aspects = detect_aspects('The spaceship collectible looks nice on my desk.')

        self.assertNotIn('delivery', aspects)

    def test_detects_multi_word_aspect_phrase(self):
        aspects = detect_aspects('This was a waste of money, but the packaging was fine.')

        self.assertIn('price', aspects)
        self.assertIn('delivery', aspects)

    def test_analyze_aspects_returns_sentiment_payload(self):
        result = analyze_aspects('The quality is excellent. The shipping was terrible and the delivery was bad.')

        self.assertIn('quality', result)
        self.assertIn('delivery', result)
        self.assertEqual(result['quality']['label'], 'positive')
        self.assertIn(result['delivery']['label'], ['negative', 'neutral'])
        self.assertIn('polarity', result['quality'])

    def test_analyze_aspects_falls_back_when_textblob_corpora_are_missing(self):
        with patch('backend._4_absa.TextBlob.sentences', new_callable=PropertyMock) as mock_sentences:
            mock_sentences.side_effect = MissingCorpusError()
            result = analyze_aspects(
                'The quality is excellent. The shipping was terrible and the delivery was bad.'
            )

        self.assertIn('quality', result)
        self.assertIn('delivery', result)
        self.assertIn(result['quality']['label'], ['positive', 'neutral'])
        self.assertIn(result['delivery']['label'], ['negative', 'neutral'])


if __name__ == '__main__':
    unittest.main()
