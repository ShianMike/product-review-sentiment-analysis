"""
Helpers for constructing review table rows for dashboard responses.

This module converts the processed dataframe into a compact, UI-ready
list of review dictionaries with stable keys and optional metadata.
"""

import json

import pandas as pd


def build_reviews_table(processed_df, sentiment_col, limit=500):
    """
    Build the reviews table payload used by the dashboard UI.

    Parameters:
    - processed_df: model-ready dataframe produced by preprocessing pipeline
    - sentiment_col: name of the sentiment label column to display
    - limit: max number of rows to include in the response payload
    """
    reviews_data = []
    # Limit the table payload size for UI responsiveness.
    display_df = processed_df.head(limit)
    for _, row in display_df.iterrows():
        # Aspects are stored as JSON strings in the dataframe; decode for API output.
        raw_aspects = row.get('aspects', '{}')
        aspects = json.loads(raw_aspects) if raw_aspects != '{}' else {}

        review_entry = {
            # Trim long fields to keep table rendering and payload transfer fast.
            'text': row['original_text'][:300],
            'cleaned_text': row['cleaned_text'][:200],
            'predicted_sentiment': row[sentiment_col],
            'confidence': round(row['sentiment_confidence'], 3),
            'aspects': aspects,
        }

        # Include optional fields only when they exist in the processed dataset.
        if 'rating' in row:
            review_entry['rating'] = int(row['rating']) if pd.notna(row['rating']) else None
        if 'date' in row and pd.notna(row.get('date')):
            review_entry['date'] = str(row['date'])
        if 'product_id' in row:
            review_entry['product_id'] = str(row['product_id'])
        if 'summary' in row and pd.notna(row.get('summary')):
            review_entry['summary'] = str(row['summary'])

        # One dictionary per review row, preserving display order.
        reviews_data.append(review_entry)

    return reviews_data
