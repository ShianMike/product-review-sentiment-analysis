"""
Aspect-level monthly trend builders.

This module converts per-review ABSA outputs into month-over-month sentiment
trend series for each aspect so the frontend can render aspect trend charts.

Demo mapping:
- Slide 10: Latest Demo Results - aspect trend chart in the dashboard
"""

from collections import defaultdict

import pandas as pd


def build_aspect_trends(processed_df, aspect_results, limit=8):
    """
    Build aspect sentiment trends aggregated by calendar month.

    For each of the top-mentioned aspects the function produces a chronological
    list of monthly data-points containing mention counts and sentiment
    percentages.  The result feeds the 'Selected Aspect Trend Over Time' chart
    on the dashboard.

    Parameters:
    - processed_df  : normalized DataFrame containing an optional `date` column
    - aspect_results: list of per-review aspect-sentiment dicts produced by ABSA;
                      index-aligned with processed_df rows
    - limit         : maximum number of aspects to include, ranked by total
                      mention volume so only the most-discussed are charted

    Returns:
    - A dict with keys  'aspect_ids', 'aspects', 'total_aspects_with_trends',
      or None if no date column is present or no trend data can be built.
    """
    # Without dates we cannot build a time-series, so skip gracefully.
    if 'date' not in processed_df.columns:
        return None

    if not isinstance(aspect_results, list) or not aspect_results:
        return None

    # Coerce to datetime; invalid or missing dates become NaT and are skipped below.
    monthly_dates = pd.to_datetime(processed_df['date'], errors='coerce')

    # Three-level structure: aspect -> 'YYYY-MM' month key -> sentiment counters.
    # defaultdict avoids boilerplate init checks during the accumulation loop.
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
    # Tracks cross-month totals so we can rank aspects by overall popularity.
    aspect_totals = defaultdict(int)

    # --- Accumulation loop -------------------------------------------------
    # Iterate over reviews row-by-row using zip so date and aspect data stay
    # index-aligned even if the dataframe index was reset.
    for date_value, review_aspects in zip(monthly_dates, aspect_results):
        # Skip rows where the date could not be parsed or no aspects were found.
        if pd.isna(date_value) or not isinstance(review_aspects, dict) or not review_aspects:
            continue

        # Convert to 'YYYY-MM' string; this groups all reviews in the same
        # calendar month into a single chart data-point.
        month = date_value.to_period('M').strftime('%Y-%m')

        for raw_aspect, sentiment_info in review_aspects.items():
            aspect = str(raw_aspect).strip()
            if not aspect:
                continue

            # Default to 'neutral' for any unrecognized or missing label.
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

    # Keep only the top-N aspects by total mention count across all months.
    top_aspects = sorted(
        aspect_totals.items(), key=lambda item: item[1], reverse=True
    )[: max(1, int(limit))]

    # --- Build the per-aspect monthly time-series -------------------------
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

            # Convert raw counts to percentages for chart y-axis display.
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
                    # Net sentiment = positive% - negative%; positive means
                    # customer opinion improved that month.
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
