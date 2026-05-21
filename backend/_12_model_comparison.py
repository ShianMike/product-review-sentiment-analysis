"""
[Backend Step 12 of 13] Sentiment Model Comparison

How this module fulfills Project.txt requirements:
- Specific Objective 2.2.5 and Evaluation Plan IX: compares Logistic Regression,
  Linear SVM, Multinomial Naive Bayes, Complement Naive Bayes, and SGD on the
  same TF-IDF train/test split.
- Model Info requirement: exports JSON-safe comparison metadata and scores so
  the frontend can show why the final production model was selected.

Code process:
- Step 1: Preprocess the same source dataset used for production training.
- Step 2: Train each candidate classifier on the same TF-IDF train/test split.
- Step 3: Compare accuracy, precision, recall, macro F1, and runtime.
- Step 4: Save JSON-safe results for the Model Info page.

Research grounding:
- The candidate set represents common classical sentiment-analysis baselines
  discussed in survey literature such as Tan et al. (2023), Mao et al. (2024),
  and Daza et al. (2024).
- Ranking primarily by macro F1 is intentional because review datasets are often
  class-imbalanced; macro metrics give negative, neutral, and positive classes
  equal weight instead of letting the majority class dominate accuracy.
"""

import argparse
import json
import os
import sys
import time

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import ComplementNB, MultinomialNB
from sklearn.svm import LinearSVC

try:
    from ._2_preprocessing import preprocess_dataframe
except ImportError:
    from _2_preprocessing import preprocess_dataframe


SENTIMENT_LABELS = ['negative', 'neutral', 'positive']

MODEL_CANDIDATES = (
    {
        'id': 'logistic_regression',
        'name': 'Logistic Regression',
        'feature_type': 'TF-IDF unigrams + bigrams',
        'description': 'Current baseline. Strong, fast, and interpretable for sparse text features.',
        'factory': lambda random_state: LogisticRegression(
            max_iter=1000,
            C=5.0,
            solver='lbfgs',
            class_weight={'positive': 1, 'neutral': 2.5, 'negative': 1.5},
            random_state=random_state,
        ),
    },
    {
        'id': 'linear_svm',
        'name': 'Linear SVM',
        'feature_type': 'TF-IDF unigrams + bigrams',
        'description': 'Often performs well for text classification with high-dimensional TF-IDF vectors.',
        'factory': lambda random_state: LinearSVC(
            class_weight='balanced',
            max_iter=4000,
            random_state=random_state,
        ),
    },
    {
        'id': 'multinomial_nb',
        'name': 'Multinomial Naive Bayes',
        'feature_type': 'TF-IDF unigrams + bigrams',
        'description': 'Simple probabilistic text baseline that is fast and useful for comparison.',
        'factory': lambda random_state: MultinomialNB(alpha=0.5),
    },
    {
        'id': 'complement_nb',
        'name': 'Complement Naive Bayes',
        'feature_type': 'TF-IDF unigrams + bigrams',
        'description': 'Naive Bayes variant designed to behave better on imbalanced text classes.',
        'factory': lambda random_state: ComplementNB(alpha=0.5),
    },
    {
        'id': 'sgd_logistic',
        'name': 'SGD Logistic Classifier',
        'feature_type': 'TF-IDF unigrams + bigrams',
        'description': 'Linear logistic model trained with stochastic gradient descent for larger datasets.',
        'factory': lambda random_state: SGDClassifier(
            loss='log_loss',
            penalty='l2',
            class_weight='balanced',
            max_iter=1000,
            tol=1e-3,
            random_state=random_state,
        ),
    },
)


def list_model_candidates():
    """Return JSON-safe metadata for the ML models included in the comparison."""
    return [
        {
            'id': candidate['id'],
            'name': candidate['name'],
            'feature_type': candidate['feature_type'],
            'description': candidate['description'],
        }
        for candidate in MODEL_CANDIDATES
    ]


def evaluate_model_candidates(
    texts,
    labels,
    test_size=0.2,
    random_state=42,
    max_features=50000,
    min_df=2,
):
    """
    Fit and score every candidate model on one shared TF-IDF train/test split.

    Returns a list sorted by macro F1, then accuracy. Macro F1 is ranked first
    because this review dataset can be class-imbalanced.
    """
    text_series = pd.Series(texts).fillna('').astype(str)
    label_series = pd.Series(labels).fillna('').astype(str).str.lower()
    valid = text_series.str.strip().ne('') & label_series.isin(SENTIMENT_LABELS)

    text_series = text_series[valid].reset_index(drop=True)
    label_series = label_series[valid].reset_index(drop=True)

    if label_series.nunique() < 2:
        raise ValueError('Model comparison requires at least two sentiment classes.')

    class_counts = label_series.value_counts()
    stratify = label_series if class_counts.min() >= 2 else None

    x_train, x_test, y_train, y_test = train_test_split(
        text_series,
        label_series,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify,
    )

    vectorizer = TfidfVectorizer(
        max_features=max_features,
        ngram_range=(1, 2),
        min_df=min_df,
        max_df=0.95,
        sublinear_tf=True,
    )
    x_train_tfidf = vectorizer.fit_transform(x_train)
    x_test_tfidf = vectorizer.transform(x_test)
    class_labels = [label for label in SENTIMENT_LABELS if label in set(label_series)]

    results = []
    for candidate in MODEL_CANDIDATES:
        estimator = candidate['factory'](random_state)
        start = time.perf_counter()
        estimator.fit(x_train_tfidf, y_train)
        predictions = estimator.predict(x_test_tfidf)
        elapsed = time.perf_counter() - start

        results.append({
            'model_id': candidate['id'],
            'model_name': candidate['name'],
            'feature_type': candidate['feature_type'],
            'accuracy': round(float(accuracy_score(y_test, predictions)), 4),
            'precision_macro': round(float(precision_score(y_test, predictions, average='macro', zero_division=0)), 4),
            'recall_macro': round(float(recall_score(y_test, predictions, average='macro', zero_division=0)), 4),
            'f1_macro': round(float(f1_score(y_test, predictions, average='macro', zero_division=0)), 4),
            'fit_predict_seconds': round(elapsed, 3),
            'train_size': int(len(x_train)),
            'test_size': int(len(x_test)),
            'class_labels': class_labels,
            'confusion_matrix': confusion_matrix(y_test, predictions, labels=class_labels).tolist(),
        })

    results.sort(key=lambda item: (item['f1_macro'], item['accuracy']), reverse=True)
    for index, result in enumerate(results, start=1):
        result['rank'] = index

    return results


def format_model_comparison_table(results):
    """Format comparison results as a compact console table."""
    header = 'Rank | Model | Accuracy | Macro Precision | Macro Recall | Macro F1 | Seconds'
    rows = [header, '-' * len(header)]
    for result in results:
        rows.append(
            f"{result['rank']:>4} | "
            f"{result['model_name']:<28} | "
            f"{result['accuracy']:.4f} | "
            f"{result['precision_macro']:.4f} | "
            f"{result['recall_macro']:.4f} | "
            f"{result['f1_macro']:.4f} | "
            f"{result['fit_predict_seconds']:.3f}"
        )
    return '\n'.join(rows)


def load_comparison_dataframe(data_path, sample_size):
    """Load either a processed training CSV or a raw Reviews.csv-style file."""
    row_limit = None if sample_size is None or sample_size <= 0 else sample_size
    df = pd.read_csv(data_path, nrows=row_limit)

    if {'processed_text', 'sentiment_label'}.issubset(df.columns):
        return df.dropna(subset=['processed_text', 'sentiment_label']).reset_index(drop=True)

    required = {'Text', 'Score'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Raw comparison data must include {sorted(required)} columns. "
            f"Missing: {sorted(missing)}"
        )

    return preprocess_dataframe(
        df,
        text_col='Text',
        score_col='Score',
        date_col='Time' if 'Time' in df.columns else None,
        product_col='ProductId' if 'ProductId' in df.columns else None,
        summary_col='Summary' if 'Summary' in df.columns else None,
        label_mode='hybrid',
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description='Compare multiple sentiment ML models.')
    default_processed = os.path.join(os.path.dirname(__file__), 'exports', 'processed_training_dataset.csv')
    default_raw = os.path.join(os.path.dirname(__file__), '..', 'Reviews.csv')
    parser.add_argument('--data', default=default_processed if os.path.exists(default_processed) else default_raw)
    parser.add_argument(
        '--sample-size',
        type=int,
        default=0,
        help='Rows to read from the data file. Use 0 or omit it to use the full processed training file.',
    )
    parser.add_argument('--test-size', type=float, default=0.2)
    parser.add_argument('--max-features', type=int, default=50000)
    parser.add_argument('--output-json', default='')
    args = parser.parse_args(argv)

    comparison_df = load_comparison_dataframe(args.data, args.sample_size)
    results = evaluate_model_candidates(
        comparison_df['processed_text'],
        comparison_df['sentiment_label'],
        test_size=args.test_size,
        max_features=args.max_features,
        min_df=2 if len(comparison_df) >= 100 else 1,
    )

    print('\nModels tested:')
    for model in list_model_candidates():
        print(f"- {model['name']}: {model['description']}")

    print('\n' + format_model_comparison_table(results))

    if args.output_json:
        with open(args.output_json, 'w', encoding='utf-8') as file:
            json.dump({'models': list_model_candidates(), 'results': results}, file, indent=2)
        print(f"\nSaved comparison JSON to {args.output_json}")

    return results


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
