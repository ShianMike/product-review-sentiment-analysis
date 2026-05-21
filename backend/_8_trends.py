"""
[Backend Step 8 of 13] Monthly Sentiment Trends

This file builds overall month-by-month sentiment trends.

Presentation flow:
- Step 1: Check if the processed data has a usable date column.
- Step 2: Convert each date into a year-month bucket.
- Step 3: Count positive, neutral, and negative reviews per month.
- Step 4: Return rows that the Trends tab can draw directly.
"""


def build_monthly_trends(processed_df, sentiment_col):
    """
    Build month-level sentiment trends when parsed dates are available.

    Returns:
    - List of month dictionaries with counts and percentages, or None when
      date information is unavailable/unparseable.
    """
    trends = None
    if 'date' in processed_df.columns:
        try:
            # Convert each parsed date to a year-month bucket like "2026-04".
            trend_df = processed_df.copy()
            trend_df['month'] = trend_df['date'].dt.to_period('M').astype(str)

            trends_data = []
            # Compute sentiment counts and percentages for each month.
            # Grouping by month keeps chart granularity readable for long datasets.
            for month, group in trend_df.groupby('month'):
                month_dist = group[sentiment_col].value_counts()
                month_total = len(group)
                # Each row is already shaped for the trends chart, so the frontend
                # can plot counts or percentages without recomputing aggregates.
                trends_data.append({
                    'month': str(month),
                    'total': month_total,
                    'positive': int(month_dist.get('positive', 0)),
                    'neutral': int(month_dist.get('neutral', 0)),
                    'negative': int(month_dist.get('negative', 0)),
                    'positive_pct': round(month_dist.get('positive', 0) / month_total * 100, 1),
                    'negative_pct': round(month_dist.get('negative', 0) / month_total * 100, 1),
                })

            # Sort chronologically so charts render in natural time order.
            trends = sorted(trends_data, key=lambda x: x['month'])
        except (AttributeError, TypeError, ValueError):
            # Keep trends optional: if date parsing fails, return None safely.
            trends = None
    return trends
