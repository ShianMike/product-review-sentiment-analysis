"""
[Backend Step 10 of 13] Reviews Table Row Builder

This module structures and formats raw review rows into structured API dictionaries
used by the frontend Reviews tab.

Design decisions:
1. Row limits for dashboard responsiveness:
   - Reading thousands of rows at startup degrades browser loading speed.
   - We support a limit parameter: when loading the initial dashboard overview, we return
     only a capped sample (500 rows). When querying the specific reviews route, the limit
     is removed (set to None) to serve the entire processed file for filtering.
2. JSON decoding of aspects:
   - Aspects are stored as serialized JSON strings in the DataFrame since CSV formats
     only support flat scalar values.
   - We deserialize this string back into a Python dictionary structure so the frontend
     can loop through specific aspect tags and display them as colored chips.
3. Metadata checks:
   - Ratings, dates, product identifiers, and AI summaries are optional. The builder
     checks for their presence before inserting them to prevent key errors.
"""

import json
import pandas as pd


def build_reviews_table(processed_df, sentiment_col, limit=500):
    """
    Transforms DataFrame rows into clean, structured dictionaries for the review table.

    Args:
        processed_df (pd.DataFrame): DataFrame containing review rows and model outcomes.
        sentiment_col (str): DataFrame column containing predicted sentiment labels.
        limit (int, optional): Maximum reviews to return. Defaults to 500.

    Returns:
        list[dict]: A list of formatted review dictionaries containing text, sentiment,
                    confidence, aspects, and metadata.
    """
    reviews_data = []

    # Step 1: Apply review count limits.
    # We slice the head of the DataFrame if a limit is specified.
    display_df = processed_df if limit is None else processed_df.head(limit)

    # Step 2: Loop through rows and construct objects.
    for _, row in display_df.iterrows():
        # Aspects are stored in the CSV as flat JSON strings.
        # We deserialize aspects (e.g. '{"Shipping": {"label": "positive"}}') back into a dictionary.
        raw_aspects = row.get('aspects', '{}')
        try:
            aspects = json.loads(raw_aspects) if isinstance(raw_aspects, str) and raw_aspects != '{}' else {}
        except (json.JSONDecodeError, TypeError):
            aspects = {}

        review_entry = {
            'text': str(row.get('original_text', '')),
            'cleaned_text': str(row.get('cleaned_text', '')),
            'predicted_sentiment': row[sentiment_col],
            # Round confidence level to 3 decimal places for readable API payload logs.
            'confidence': round(row['sentiment_confidence'], 3),
            'aspects': aspects,
        }

        # Step 3: Dynamically append optional columns if they exist in this dataset.
        if 'rating' in row:
            review_entry['rating'] = int(row['rating']) if pd.notna(row['rating']) else None
        if 'date' in row and pd.notna(row.get('date')):
            review_entry['date'] = str(row['date'])
        if 'product_id' in row:
            review_entry['product_id'] = str(row['product_id'])
        if 'summary' in row and pd.notna(row.get('summary')):
            review_entry['summary'] = str(row['summary'])

        reviews_data.append(review_entry)

    return reviews_data
