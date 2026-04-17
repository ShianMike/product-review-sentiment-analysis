import unittest
from unittest.mock import patch

import backend._2_preprocessing as preprocessing


class _FailingStopWords:
    def words(self, language):
        raise LookupError("missing stopwords corpus")


class PreprocessingFallbackTests(unittest.TestCase):
    def test_stopword_loading_falls_back_when_nltk_data_is_missing(self):
        with patch.object(preprocessing, "stopwords", _FailingStopWords()):
            stop_words = preprocessing._load_stop_words()

        self.assertIn("and", stop_words)
        self.assertNotIn("not", stop_words)
        self.assertNotIn("no", stop_words)


if __name__ == "__main__":
    unittest.main()
