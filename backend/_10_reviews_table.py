"""
[Backend Step 10 of 13] Reviews Table Builder

This file builds the row data shown in the Reviews tab.

Presentation flow:
- Step 1: Use either a small dashboard sample or all processed rows.
- Step 2: Decode stored aspect JSON into normal objects.
- Step 3: Keep optional rating, date, product ID, and summary fields.
- Step 4: Return one dictionary per review for search, sorting, filtering, and
  the details modal.
"""


import json

import pandas as pd


def build_reviews_table(processed_df, sentiment_col, limit=500):
    """
    Build the review rows used by the dashboard table.

    Parameters:
    - processed_df: model-ready dataframe produced by preprocessing pipeline
    - sentiment_col: name of the sentiment label column to display
    - limit: max number of rows to include in the response payload. Pass None
      to return every processed row.
    """
    reviews_data = []
    # Initial dashboard payloads pass a limit for responsiveness; the dedicated
    # Reviews endpoint passes None so the tab can load the full processed file.
    display_df = processed_df if limit is None else processed_df.head(limit)
    for _, row in display_df.iterrows():
        # Aspects are stored as JSON strings in the dataframe; decode for API output.
        raw_aspects = row.get('aspects', '{}')
        try:
            aspects = json.loads(raw_aspects) if isinstance(raw_aspects, str) and raw_aspects != '{}' else {}
        except (json.JSONDecodeError, TypeError):
            aspects = {}

        review_entry = {
            'text': str(row.get('original_text', '')),
            'cleaned_text': str(row.get('cleaned_text', '')),
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
