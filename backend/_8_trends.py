"""
[Backend Step 8 of 13] Monthly Sentiment Trends

This module aggregates the review-by-review predictions into month-by-month buckets.
These time-series aggregates are what power the Trend line and area charts on the frontend.

Design decisions and data structure details:
1. Why group by month?
   - Aggregating reviews by year-month (e.g. "2026-04") strikes the perfect balance
     between readability and data density. Slicing by day is too noisy, and slicing
     by year hides seasonal movements.
2. What values are calculated?
   - For each month, we calculate the absolute count of positive, neutral, and negative
     reviews, as well as percentage rates for positive and negative.
   - We keep percentages rounded to a single decimal place to align with standard reporting formats.
3. Chronological sorting:
   - Data is sorted chronologically by the year-month key so that charts read naturally
     from left to right.
"""


def build_monthly_trends(processed_df, sentiment_col):
    """
    Groups reviews by year-month and counts sentiment occurrences.

    Args:
        processed_df (pd.DataFrame): The main cleaned review DataFrame.
        sentiment_col (str): The column name containing predicted sentiments
                             ('positive', 'neutral', 'negative').

    Returns:
        list[dict]: A chronologically sorted list of monthly stats, or None
                    if the date column is missing or unparseable.
    """
    trends = None

    # Step 1: Check if the processed data has a valid, parsed date column.
    # If the date column doesn't exist, we skip trend building and return None.
    if 'date' in processed_df.columns:
        try:
            # Step 2: Copy the DataFrame to avoid mutating the original data in-place.
            trend_df = processed_df.copy()

            # Step 3: Convert the pandas datetime series into year-month period strings.
            # dt.to_period('M') transforms timestamp objects into Period objects (e.g. Period('2026-05', 'M')).
            # Converting to string ensures it translates into standard JSON strings (e.g. "2026-05") for the API.
            trend_df['month'] = trend_df['date'].dt.to_period('M').astype(str)

            trends_data = []

            # Step 4: Group reviews by the new 'month' column and compile counts.
            for month, group in trend_df.groupby('month'):
                month_dist = group[sentiment_col].value_counts()
                month_total = len(group)

                # Each dict represents a single data point in our time series.
                # All counts are coerced to standard Python ints so they serialize to JSON correctly.
                trends_data.append({
                    'month': str(month),
                    'total': month_total,
                    'positive': int(month_dist.get('positive', 0)),
                    'neutral': int(month_dist.get('neutral', 0)),
                    'negative': int(month_dist.get('negative', 0)),
                    # Calculate percentage shares. Neutral rate is omitted here as the
                    # frontend computes it dynamically to reduce JSON payload size.
                    'positive_pct': round(month_dist.get('positive', 0) / month_total * 100, 1),
                    'negative_pct': round(month_dist.get('negative', 0) / month_total * 100, 1),
                })

            # Step 5: Sort the month list chronologically.
            # Since month values are strings formatted as 'YYYY-MM', a standard alphabetical
            # string sort arranges them in chronological order.
            trends = sorted(trends_data, key=lambda x: x['month'])

        except (AttributeError, TypeError, ValueError):
            # Safe Fallback: If date values are malformed and cause pandas to raise errors,
            # we catch the exception and return None. This prevents date parsing errors from
            # crashing the entire dashboard generation pipeline.
            trends = None

    return trends
