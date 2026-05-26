import tempfile
import unittest
from pathlib import Path

from backend._3_sentiment import SentimentClassifier


class SentimentModelCompatibilityTests(unittest.TestCase):
    def test_load_restores_missing_multi_class_on_saved_logistic_regression(self):
        classifier = SentimentClassifier()
        texts = [
            'great quality product',
            'great quality item',
            'love this product',
            'excellent quality item',
            'bad quality product',
            'terrible bad item',
            'hate this product',
            'waste of money item',
            'okay average product',
            'average okay item',
            'decent ordinary product',
            'fine average item',
        ]
        labels = [
            'positive',
            'positive',
            'positive',
            'positive',
            'negative',
            'negative',
            'negative',
            'negative',
            'neutral',
            'neutral',
            'neutral',
            'neutral',
        ]
        tfidf_matrix = classifier.vectorizer.fit_transform(texts)
        classifier.model.fit(tfidf_matrix, labels)
        classifier.is_trained = True

        if hasattr(classifier.model, 'multi_class'):
            delattr(classifier.model, 'multi_class')

        with tempfile.TemporaryDirectory() as temp_dir:
            model_path = Path(temp_dir) / 'sentiment_model.joblib'
            vectorizer_path = Path(temp_dir) / 'tfidf_vectorizer.joblib'
            classifier.save(str(model_path), str(vectorizer_path))

            reloaded = SentimentClassifier()
            reloaded.load(str(model_path), str(vectorizer_path))

            self.assertTrue(hasattr(reloaded.model, 'multi_class'))
            self.assertEqual(reloaded.model.multi_class, 'auto')

            predicted_labels, probabilities = reloaded.predict(['great quality product'])
            self.assertEqual(len(predicted_labels), 1)
            self.assertEqual(probabilities.shape[0], 1)


if __name__ == '__main__':
    unittest.main()
