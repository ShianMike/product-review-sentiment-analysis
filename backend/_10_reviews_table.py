"""
[Pipeline Step 10 of 11] Reviews Table Builder

How this module fulfills Project.txt requirements:
- Functional Requirement 7.2 and Expected Outputs XI: creates the row-level
  payload used by the Reviews tab for searching, sorting, filtering,
  pagination, export, and the Review Details modal.
- Scope 3.1: preserves optional metadata (rating, date, product ID, summary)
  so the frontend can show richer review context when those columns exist.

Design note:
- The initial dashboard payload is capped for responsiveness; the dedicated
  /api/reviews endpoint can request all rows from the processed export. This
  matches the Project.txt performance requirement for classroom-scale use while
  still supporting detailed row-level inspection.
"""


import json

import pandas as pd


def build_reviews_table(processed_df, sentiment_col, limit=500):
    """
    Build the reviews table payload used by the dashboard UI.

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
