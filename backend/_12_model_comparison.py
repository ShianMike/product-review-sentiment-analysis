"""
[Backend Step 12 of 13] Sentiment Model Comparison Evaluation Pipeline

This script evaluates multiple machine learning classifiers against each other using
an identical train/test split. It generates metrics (Accuracy, Precision, Recall, Macro F1,
and execution times) to validate model decisions and selects the optimal classifier configuration.

Evaluation workflow:
- Step 1: Ingest the processed training review dataset.
- Step 2: Tokenize and extract TF-IDF unigram and bigram features across all models.
- Step 3: Run training and prediction evaluations on candidates (e.g. Logistic Regression, Naive Bayes, Linear SVM).
- Step 4: Sort candidates by Macro F1 score to account for potential class imbalances.
- Step 5: Save compiled results to a JSON file to populate the Model Info tab metrics tables.
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

# --- CANDIDATE MACHINE LEARNING ESTIMATORS ---
# Configurations and hyperparameter factories for each classifier candidate.
# The class weights for Logistic Regression adjust for the higher frequency
# of positive reviews relative to negative and neutral in standard feedback datasets.
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
    """
    Returns JSON-safe metadata for the ML models included in the comparison.

    This metadata describes the candidate identifiers, human-readable names,
    extracted text features, and design rationales displayed in UI comparison tables.
    """
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
    Trains and evaluates all candidate models against a stratified test set.

    Takes review texts and label target arrays, constructs unified train/test splits,
    extracts common TF-IDF unigrams and bigrams, fits each estimator model, records
    processing time, computes metrics (Accuracy, Precision, Recall, Macro F1, Confusion Matrix),
    and outputs results sorted in descending order of Macro F1.
    """
    # 1. Clean inputs and select valid rows
    text_series = pd.Series(texts).fillna('').astype(str)
    label_series = pd.Series(labels).fillna('').astype(str).str.lower()
    valid = text_series.str.strip().ne('') & label_series.isin(SENTIMENT_LABELS)

    text_series = text_series[valid].reset_index(drop=True)
    label_series = label_series[valid].reset_index(drop=True)

    if label_series.nunique() < 2:
        raise ValueError('Model comparison requires at least two sentiment classes.')

    # 2. Divide dataset into training and test splits
    # Stratifies the split if the minority class size allows it, guaranteeing
    # comparable class proportions across both training and test data segments.
    class_counts = label_series.value_counts()
    stratify = label_series if class_counts.min() >= 2 else None

    x_train, x_test, y_train, y_test = train_test_split(
        text_series,
        label_series,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify,
    )

    # 3. Vectorize text features using TF-IDF (unigrams and bigrams)
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

    # 4. Fit estimators and compute performance metrics
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

    # 5. Sort candidate models in descending order of Macro F1 score
    results.sort(key=lambda item: (item['f1_macro'], item['accuracy']), reverse=True)
    for index, result in enumerate(results, start=1):
        result['rank'] = index

    return results


def format_model_comparison_table(results):
    """
    Formats the structured model evaluation metrics into a clean console table.

    Draws a text-based chart displaying ranking numbers, candidate names, and
    associated metrics (accuracy, precision, recall, macro F1, and run speeds).
    """
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
    """
    Ingests validation reviews, supporting both processed tables and raw spreadsheets.

    It accepts a CSV/Excel file path, applies row caps if requested, checks for
    requisite text/rating fields, and invokes the standard preprocessing module
    to output structured text and label arrays.
    """
    row_limit = None if sample_size is None or sample_size <= 0 else sample_size
    df = pd.read_csv(data_path, nrows=row_limit)

    # If the file is already preprocessed, drop empty rows and return
    if {'processed_text', 'sentiment_label'}.issubset(df.columns):
        return df.dropna(subset=['processed_text', 'sentiment_label']).reset_index(drop=True)

    # Verify column presence in case we are importing a raw Reviews.csv file
    required = {'Text', 'Score'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"Raw comparison data must include {sorted(required)} columns. "
            f"Missing: {sorted(missing)}"
        )

    # Apply full pipeline preprocessing
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
    """
    Main script controller parsing command arguments, running tests, and exporting JSON.
    """
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

    # 1. Load and clean comparison records
    comparison_df = load_comparison_dataframe(args.data, args.sample_size)

    # 2. Evaluate all candidate models
    results = evaluate_model_candidates(
        comparison_df['processed_text'],
        comparison_df['sentiment_label'],
        test_size=args.test_size,
        max_features=args.max_features,
        min_df=2 if len(comparison_df) >= 100 else 1,
    )

    # 3. Print results summary to console
    print('\nModels tested:')
    for model in list_model_candidates():
        print(f"- {model['name']}: {model['description']}")

    print('\n' + format_model_comparison_table(results))

    # 4. Save results to disk to allow the frontend to access comparison metrics
    if args.output_json:
        with open(args.output_json, 'w', encoding='utf-8') as file:
            json.dump({'models': list_model_candidates(), 'results': results}, file, indent=2)
        print(f"\nSaved comparison JSON to {args.output_json}")

    return results


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
