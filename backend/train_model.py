"""
Model Training Script
Trains the sentiment classifier using Reviews.csv dataset.
Run this script once to generate the trained model files.

Workflow summary:
1. Load and optionally subsample labeled review data.
2. Preprocess text/metadata into model-ready schema.
3. Train classifier, save artifacts, and print evaluation summary.

Demo mapping:
- Slide 4: Datasets Used In This Project
- Slide 8: Current Model Performance
"""

import os
import sys
import time
import pandas as pd

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from preprocessing import preprocess_dataframe
from sentiment import SentimentClassifier


def train_model(data_path, sample_size=100000):
    """
    Train the sentiment classifier from the Reviews.csv dataset.
    
    Parameters:
    - data_path: path to Reviews.csv
    - sample_size: number of reviews to use for training (None for all)

    Returns:
    - Metrics dictionary produced by SentimentClassifier.train
    """
    print("="*60)
    print("SENTIMENT MODEL TRAINING")
    print("="*60)
    
    # Load dataset
    print(f"\nLoading dataset from {data_path}...")
    start_time = time.time()
    # Reviews.csv is read once, then sampled to keep training manageable on local machines.
    df = pd.read_csv(data_path)
    print(f"Loaded {len(df)} reviews in {time.time() - start_time:.1f}s")
    
    # Sample if dataset is too large (for faster training)
    if sample_size and len(df) > sample_size:
        print(f"Sampling {sample_size} reviews for training...")
        # Fixed random_state keeps experiments reproducible across reruns.
        df = df.sample(n=sample_size, random_state=42)
    
    # Preprocess
    print("\nPreprocessing reviews...")
    start_time = time.time()
    # Align schema with the Reviews column names used in this project.
    processed_df = preprocess_dataframe(
        df, 
        text_col='Text', 
        score_col='Score',
        date_col='Time',
        product_col='ProductId',
        summary_col='Summary'
    )
    print(f"Preprocessing completed in {time.time() - start_time:.1f}s")
    print(f"Processed {len(processed_df)} reviews")
    
    # Show class distribution
    print("\nSentiment distribution:")
    dist = processed_df['sentiment_label'].value_counts()
    # Surface class balance before model training to spot skewed datasets early.
    for label, count in dist.items():
        pct = count / len(processed_df) * 100
        print(f"  {label:>10}: {count:>6} ({pct:.1f}%)")
    
    # Train classifier
    print("\n" + "="*60)
    classifier = SentimentClassifier()
    # SentimentClassifier handles train/test split, vectorization, and metric computation.
    metrics = classifier.train(
        texts=processed_df['processed_text'],
        labels=processed_df['sentiment_label']
    )
    
    # Save model
    print("\nSaving model...")
    # Persist model/vectorizer/metrics under backend/models for API inference.
    classifier.save()
    
    # Print final summary
    print("\n" + "="*60)
    print("TRAINING COMPLETE")
    print("="*60)
    print(f"Accuracy:  {metrics['accuracy']:.4f}")
    print(f"Precision: {metrics['precision_macro']:.4f}")
    print(f"Recall:    {metrics['recall_macro']:.4f}")
    print(f"F1 Score:  {metrics['f1_macro']:.4f}")
    print(f"\nModel saved to backend/models/")
    # Returning metrics makes this function reusable in scripts/tests/automation.
    return metrics


if __name__ == '__main__':
    # Path to the training dataset
    # Demo guide: Reviews.csv is the large labeled dataset used to train the baseline model.
    data_path = os.path.join(os.path.dirname(__file__), '..', 'Reviews.csv')
    
    if not os.path.exists(data_path):
        print(f"ERROR: Dataset not found at {data_path}")
        sys.exit(1)
    
    # Train with 150k samples
    # This value balances quality and training time for class demos.
    train_model(data_path, sample_size=150000)
