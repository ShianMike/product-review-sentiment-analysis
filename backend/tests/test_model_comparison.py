import unittest

from backend._12_model_comparison import (
    evaluate_model_candidates,
    format_model_comparison_table,
    list_model_candidates,
)


class ModelComparisonTests(unittest.TestCase):
    def test_lists_all_ml_models_used_for_comparison(self):
        models = list_model_candidates()
        model_names = [model['name'] for model in models]

        self.assertEqual(model_names, [
            'Logistic Regression',
            'Linear SVM',
            'Multinomial Naive Bayes',
            'Complement Naive Bayes',
            'SGD Logistic Classifier',
        ])

    def test_evaluates_candidate_models_on_shared_split(self):
        texts = [
            'excellent quality works great',
            'great product love it',
            'perfect item fast delivery',
            'happy with quality',
            'amazing value recommend',
            'good durable product',
            'terrible quality broke quickly',
            'awful product waste money',
            'not good stopped working',
            'bad packaging arrived broken',
            'poor quality never buy',
            'disappointed not worth money',
            'average item acceptable',
            'okay product nothing special',
            'fine but could be better',
            'decent product ordinary',
            'mixed experience acceptable',
            'reasonable but not impressive',
            'excellent build very happy',
            'worst purchase broken part',
            'ordinary package average result',
            'love this useful product',
            'never recommend poor item',
            'just okay for price',
        ]
        labels = [
            'positive', 'positive', 'positive', 'positive', 'positive', 'positive',
            'negative', 'negative', 'negative', 'negative', 'negative', 'negative',
            'neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral',
            'positive', 'negative', 'neutral', 'positive', 'negative', 'neutral',
        ]

        results = evaluate_model_candidates(texts, labels, test_size=0.25, max_features=3000)
        table = format_model_comparison_table(results)

        self.assertEqual(len(results), 5)
        self.assertEqual([result['rank'] for result in results], [1, 2, 3, 4, 5])
        self.assertIn('Logistic Regression', table)
        self.assertIn('Linear SVM', table)
        for result in results:
            self.assertIn('accuracy', result)
            self.assertIn('f1_macro', result)
            self.assertEqual(result['train_size'], 18)
            self.assertEqual(result['test_size'], 6)


if __name__ == '__main__':
    unittest.main()
