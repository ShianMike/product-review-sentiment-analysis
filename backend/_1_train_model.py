"""
[Backend Step 1 of 13] Model Training Script

This file prepares and trains the sentiment model used by the app.

Presentation flow:
- Step 1: Read the review dataset.
- Step 2: Clean the review text and create sentiment labels from ratings/text.
- Step 3: Train the TF-IDF + Logistic Regression classifier.
- Step 4: Save the trained model, vectorizer, metrics, and processed CSV.
"""

import os
import sys
import time
import pandas as pd

# Add parent directory to path so sibling modules are importable.
sys.path.insert(0, os.path.dirname(__file__))

from _2_preprocessing import preprocess_dataframe
from _3_sentiment import SentimentClassifier

# Directory where the processed training dataset will be saved.
EXPORTS_DIR = os.path.join(os.path.dirname(__file__), 'exports')

# Only load the columns used by the training pipeline. This keeps CSV parsing
# bounded and avoids spending time/materializing fields the model never reads.
TRAINING_COLUMNS = ['Text', 'Score', 'Time', 'ProductId', 'Summary']

# Hybrid mode runs TextBlob on ambiguous 2/3/4-star reviews to produce more
# accurate labels. It is slower (~60-90s extra per 150k rows) but improves
# label quality for the neutral class. Set to float('inf') to always use it.
HYBRID_LABEL_MAX_ROWS = float('inf')


# ─── 1_LoadData ──────────────────────────────────────────────────────────────────
def step_1_load_data(data_path, sample_size=None):
    """
    Step 1: Read the raw Reviews.csv file.

    Only the columns needed for training are loaded. sample_size can limit the
    row count so training finishes faster during demos or testing.

    Parameters:
    - data_path:    path to Reviews.csv
    - sample_size:  max rows to read (None = use all rows)

    Returns:
    - Raw pandas DataFrame, possibly row-limited.
    """
    print("\n" + "-"*60)
    print("STEP 1 – Load Data")
    print("-"*60)
    print(f"  Source file : {data_path}")

    start = time.time()
    read_kwargs = {
        'usecols': lambda col: col in TRAINING_COLUMNS,
        'low_memory': False,
    }
    if sample_size:
        read_kwargs['nrows'] = int(sample_size)

    df = pd.read_csv(data_path, **read_kwargs)
    elapsed = time.time() - start
    print(f"  Rows loaded : {len(df):,}  ({elapsed:.1f}s)")
    print(f"  Columns     : {list(df.columns)}")

    return df


# ─── 2_Preprocess ────────────────────────────────────────────────────────────────
def step_2_preprocess(df):
    """
    Step 2: Clean the raw reviews and create training labels.

    The preprocessing function removes noisy text, keeps useful metadata, and
    maps ratings/text into positive, neutral, or negative labels.

    Returns:
    - Processed DataFrame with columns: original_text, cleaned_text,
      processed_text, rating, date, product_id, summary, sentiment_label
    """
    print("\n" + "-"*60)
    print("STEP 2 – Preprocess")
    print("-"*60)

    start = time.time()
    label_mode = 'hybrid' if len(df) <= HYBRID_LABEL_MAX_ROWS else 'rating'
    print(f"  Label mode  : {label_mode}")
    # Align schema with the Reviews column names used in this project.
    processed_df = preprocess_dataframe(
        df,
        text_col='Text',
        score_col='Score',
        date_col='Time',
        product_col='ProductId',
        summary_col='Summary',
        label_mode=label_mode
    )
    elapsed = time.time() - start
    print(f"  Rows after preprocessing : {len(processed_df):,}  ({elapsed:.1f}s)")

    return processed_df


# ─── 3_SaveProcessed ─────────────────────────────────────────────────────────────
def step_3_save_processed(processed_df):
    """
    Step 3: Save the cleaned training data to backend/exports/.

    This makes the exact text and labels visible before the model learns from
    them. It is useful for checking the training data during a presentation.

    Returns:
    - Absolute path to the saved CSV file.
    """
    print("\n" + "-"*60)
    print("STEP 3 – Save Processed Training Dataset")
    print("-"*60)

    os.makedirs(EXPORTS_DIR, exist_ok=True)
    out_path = os.path.join(EXPORTS_DIR, 'processed_training_dataset.csv')

    processed_df.to_csv(out_path, index=False)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"  Saved to    : {out_path}")
    print(f"  File size   : {size_mb:.1f} MB")
    print(f"  Row count   : {len(processed_df):,}")
    print(f"  Columns     : {list(processed_df.columns)}")

    return out_path


# ─── 4_ClassBalance ──────────────────────────────────────────────────────────────
def step_4_load_processed(csv_path):
    """
    Step 4: Reload the saved processed CSV.

    The model trains from the same CSV that was saved in Step 3. This keeps the
    process easy to explain: the visible processed file is the training source.

    Returns:
    - Loaded pandas DataFrame from the processed CSV.
    """
    print("\n" + "-"*60)
    print("STEP 4 – Load Processed Training Dataset")
    print("-"*60)

    import time
    start = time.time()
    loaded_df = pd.read_csv(csv_path)
    elapsed = time.time() - start

    # Drop any rows that may have lost their text during CSV round-trip.
    loaded_df = loaded_df.dropna(subset=['processed_text'])
    loaded_df = loaded_df[loaded_df['processed_text'].str.strip() != '']
    loaded_df = loaded_df.reset_index(drop=True)

    print(f"  Source file : {csv_path}")
    print(f"  Rows loaded : {len(loaded_df):,}  ({elapsed:.1f}s)")
    print(f"  Columns     : {list(loaded_df.columns)}")

    return loaded_df


# ─── 5_ClassBalance ──────────────────────────────────────────────────────────────
def step_5_class_balance(processed_df):
    """
    Step 5: Show how many reviews belong to each sentiment class.

    This helps explain whether the dataset has many more positive, neutral, or
    negative reviews before the model is trained.
    """
    print("\n" + "-"*60)
    print("STEP 5 – Class Balance")
    print("-"*60)

    dist = processed_df['sentiment_label'].value_counts()
    for label, count in dist.items():
        pct = count / len(processed_df) * 100
        print(f"  {label:>10}: {count:>7,} ({pct:.1f}%)")


# ─── 6_TrainModel ────────────────────────────────────────────────────────────────
def step_6_train_model(processed_df):
    """
    Step 6: Train the model on processed review text and sentiment labels.

    TF-IDF turns words/phrases into numbers. Logistic Regression learns from
    those numbers to predict positive, neutral, or negative sentiment.

    Returns:
    - (classifier, metrics) tuple
      classifier : trained SentimentClassifier instance
      metrics    : dict with accuracy, precision_macro, recall_macro, f1_macro

    SentimentClassifier handles the train/test split, vectorization, and
    metric computation internally.
    """
    print("\n" + "-"*60)
    print("STEP 6 – Train Model")
    print("-"*60)

    classifier = SentimentClassifier()
    # SentimentClassifier handles train/test split, vectorization, and metric
    # computation internally.
    metrics = classifier.train(
        texts=processed_df['processed_text'],
        labels=processed_df['sentiment_label']
    )

    return classifier, metrics


# ─── 7_SaveModel ─────────────────────────────────────────────────────────────────
def step_7_save_model(classifier):
    """
    Step 7: Save the trained model files under backend/models/.

    The Flask API loads these files later, so users can analyze reviews without
    retraining the model every time.
    """
    print("\n" + "-"*60)
    print("STEP 7 – Save Model")
    print("-"*60)

    classifier.save()
    print("  Model artifacts saved to backend/models/")


# ─── 8_Evaluate ──────────────────────────────────────────────────────────────────
def step_8_evaluate(metrics):
    """
    Step 8: Print the final model scores for presentation and checking.
    """
    print("\n" + "-"*60)
    print("STEP 8 – Evaluation Summary")
    print("-"*60)
    print(f"  Accuracy  : {metrics['accuracy']:.4f}")
    print(f"  Precision : {metrics['precision_macro']:.4f}")
    print(f"  Recall    : {metrics['recall_macro']:.4f}")
    print(f"  F1 Score  : {metrics['f1_macro']:.4f}")


# ─── Orchestrator ─────────────────────────────────────────────────────────────────
def train_model(data_path, sample_size=100000):
    """
    Run the full training pipeline by calling each numbered step in order.

    Parameters:
    - data_path:    path to Reviews.csv
    - sample_size:  number of reviews to use for training (None for all)

    Returns:
    - Metrics dictionary produced by SentimentClassifier.train
    """
    print("=" * 60)
    print("SENTIMENT MODEL TRAINING")
    print("=" * 60)

    # 1_LoadData – Read and optionally subsample the raw CSV.
    df = step_1_load_data(data_path, sample_size)

    # 2_Preprocess – Clean, tokenize, lemmatize, derive hybrid labels.
    processed_df = step_2_preprocess(df)

    # 3_SaveProcessed – Write the processed dataset for manual inspection.
    csv_path = step_3_save_processed(processed_df)

    # 4_LoadProcessed - Reload from the saved CSV so the model trains from the
    # exact file we can inspect.
    training_df = step_4_load_processed(csv_path)

    # 5_ClassBalance – Show class distribution before training.
    step_5_class_balance(training_df)

    # 6_TrainModel – Fit the TF-IDF + LR classifier.
    classifier, metrics = step_6_train_model(training_df)

    # 7_SaveModel – Persist artifacts under backend/models/.
    step_7_save_model(classifier)

    # 8_Evaluate – Print final metrics.
    step_8_evaluate(metrics)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)

    # Returning metrics makes this function reusable in scripts/tests/automation.
    return metrics


if __name__ == '__main__':
    # Path to the training dataset. Reviews.csv is the large rating-labeled
    # review corpus used to train the final TF-IDF + Logistic Regression model.
    data_path = os.path.join(os.path.dirname(__file__), '..', 'Reviews.csv')

    if not os.path.exists(data_path):
        print(f"ERROR: Dataset not found at {data_path}")
        sys.exit(1)

    # Train with 150k samples.
    # This value balances quality and training time for class demos.
    train_model(data_path, sample_size=150000)
