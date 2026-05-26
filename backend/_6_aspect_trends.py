"""
[Backend Step 6 of 13] Aspect-Level Monthly Trends

Groups aspect mentions chronologically by calendar month to trace how customer opinion
on specific topics rises, falls, or changes over time.
"""

from collections import defaultdict

import pandas as pd


def build_aspect_trends(processed_df, aspect_results, limit=8):
    """
    Groups aspect mention counts and sentiment splits by calendar month for time-series charting.

    For each top aspect, compiles a chronological list of data points containing total mentions,
    positive/neutral/negative counts, and percentage shares for each month.
    """
    # Skips calculation if there is no date column, as a time-series cannot be constructed.
    if 'date' not in processed_df.columns:
        return None

    if not isinstance(aspect_results, list) or not aspect_results:
        return None

    # Parses the date column into pandas datetime values to standardise format and support sorting.
    monthly_dates = pd.to_datetime(processed_df['date'], errors='coerce')

    # Nested counts structure: aspect -> month ('YYYY-MM') -> sentiment distribution statistics.
    # defaultdict handles initialization checks automatically.
    counts = defaultdict(
        lambda: defaultdict(
            lambda: {
                'total_mentions': 0,
                'positive_count': 0,
                'neutral_count': 0,
                'negative_count': 0,
            }
        )
    )
    # Track total mentions of each aspect across the entire dataset to rank their popularity.
    aspect_totals = defaultdict(int)

    # Accumulates monthly counts by iterating over dates and aspect detection results in parallel.
    for date_value, review_aspects in zip(monthly_dates, aspect_results):
        # Skip rows where the date could not be parsed or no aspects were found.
        if pd.isna(date_value) or not isinstance(review_aspects, dict) or not review_aspects:
            continue

        # Formats the datetime object into a 'YYYY-MM' key to group reviews by calendar month.
        month = date_value.to_period('M').strftime('%Y-%m')

        for raw_aspect, sentiment_info in review_aspects.items():
            aspect = str(raw_aspect).strip()
            if not aspect:
                continue

            # Coerces missing or unrecognized sentiment labels to 'neutral' for safety.
            label = (sentiment_info or {}).get('label', 'neutral')
            if label not in {'positive', 'neutral', 'negative'}:
                label = 'neutral'

            # Increment the appropriate sentiment counter for this aspect+month.
            bucket = counts[aspect][month]
            bucket['total_mentions'] += 1
            bucket[f'{label}_count'] += 1
            aspect_totals[aspect] += 1

    if not aspect_totals:
        return None

    # Identifies the top aspects with the highest cross-month mention counts to limit data density.
    top_aspects = sorted(
        aspect_totals.items(), key=lambda item: item[1], reverse=True
    )[: max(1, int(limit))]

    # Builds the final monthly time-series dataset for each top aspect, sorting month keys chronologically.
    trend_payload = {}
    for aspect, _ in top_aspects:
        month_map = counts.get(aspect, {})
        monthly_points = []

        # Sort month keys chronologically so the chart renders left-to-right.
        for month in sorted(month_map.keys()):
            point = month_map[month]
            total = point['total_mentions']
            if total <= 0:
                continue

            # Converts raw count values to percentage shares for y-axis representation in Recharts.
            positive_pct = round(point['positive_count'] / total * 100, 1)
            neutral_pct  = round(point['neutral_count']  / total * 100, 1)
            negative_pct = round(point['negative_count'] / total * 100, 1)

            monthly_points.append(
                {
                    'month': month,                          # 'YYYY-MM' label for x-axis
                    'total_mentions': int(total),
                    'positive_count': int(point['positive_count']),
                    'neutral_count':  int(point['neutral_count']),
                    'negative_count': int(point['negative_count']),
                    'positive_pct': positive_pct,
                    'neutral_pct':  neutral_pct,
                    'negative_pct': negative_pct,
                    # Computes Net Sentiment (Positive% - Negative%) to summarize the overall direction of feedback.
                    # Positive net scores indicate favorable customer opinion during that month.
                    'net_sentiment': round(positive_pct - negative_pct, 1),
                }
            )

        # Only include aspects that have at least one valid monthly data-point.
        if monthly_points:
            trend_payload[aspect] = monthly_points

    if not trend_payload:
        return None

    return {
        'aspect_ids': list(trend_payload.keys()),               # ordered list of aspect names
        'aspects': trend_payload,                               # full monthly series per aspect
        'total_aspects_with_trends': len(trend_payload),        # count for UI metadata
    }
