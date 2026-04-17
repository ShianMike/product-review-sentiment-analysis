"""
[Pipeline Step 9 of 11] Product-Level Sentiment Aggregation

Groups review-level sentiment predictions by product ID to build per-product
summary cards and optional per-product monthly trend series. The dashboard
uses these to compare sentiment outcomes across products and highlight the
best-performing and highest-risk products.

Returns None when product identifiers are absent from the dataset.
"""

import pandas as pd


def build_product_summary(processed_df, sentiment_col):
    """
    Build product-level sentiment aggregates from processed review data.

    Returns all products so the frontend dropdown can list every product ID
    and the table can display the full ranking.

    Returns None when product identifiers are missing or empty.
    """
    if 'product_id' not in processed_df.columns:
        return None

    product_df = processed_df.copy()
    product_df['product_id'] = product_df['product_id'].astype(str).str.strip()
    product_df = product_df[product_df['product_id'] != '']

    if product_df.empty:
        return None

    rows = []
    for product_id, group in product_df.groupby('product_id'):
        total = len(group)
        if total <= 0:
            continue

        sentiment_dist = group[sentiment_col].value_counts()
        positive = int(sentiment_dist.get('positive', 0))
        neutral = int(sentiment_dist.get('neutral', 0))
        negative = int(sentiment_dist.get('negative', 0))

        positive_pct = round((positive / total) * 100, 1)
        neutral_pct = round((neutral / total) * 100, 1)
        negative_pct = round((negative / total) * 100, 1)

        avg_rating = None
        if 'rating' in group.columns:
            valid_ratings = group['rating'].dropna()
            if not valid_ratings.empty:
                avg_rating = round(float(valid_ratings.mean()), 2)

        avg_confidence = None
        if 'sentiment_confidence' in group.columns:
            avg_confidence = round(float(group['sentiment_confidence'].mean()), 3)

        # Each row becomes one product record for the ranking chart/table.
        rows.append({
            'product_id': product_id,
            'total_reviews': total,
            'positive_count': positive,
            'neutral_count': neutral,
            'negative_count': negative,
            'positive_pct': positive_pct,
            'neutral_pct': neutral_pct,
            'negative_pct': negative_pct,
            'net_sentiment': round(positive_pct - negative_pct, 1),
            'avg_rating': avg_rating,
            'avg_confidence': avg_confidence,
        })

    if not rows:
        return None

    rows_sorted = sorted(rows, key=lambda item: (-item['total_reviews'], item['product_id']))

    # Prefer products with a minimum review count when picking "best" and "risk"
    # summary cards so a single outlier review does not dominate the callout.
    stable_pool = [item for item in rows if item['total_reviews'] >= 5]
    comparison_pool = stable_pool if stable_pool else rows

    top_positive = max(comparison_pool, key=lambda item: item['net_sentiment'])
    top_negative = min(comparison_pool, key=lambda item: item['net_sentiment'])

    return {
        'total_products': len(rows),
        # All products included — the frontend handles display/pagination.
        'top_products': rows_sorted,
        # These two records feed the top positive / top risk highlight cards.
        'top_positive_product': {
            'product_id': top_positive['product_id'],
            'net_sentiment': top_positive['net_sentiment'],
            'total_reviews': top_positive['total_reviews'],
        },
        'top_risk_product': {
            'product_id': top_negative['product_id'],
            'net_sentiment': top_negative['net_sentiment'],
            'total_reviews': top_negative['total_reviews'],
        },
    }


def build_product_trends(processed_df, sentiment_col):
    """
    Build per-product monthly trend series for products with date metadata.

    Returns None when required columns are unavailable or no valid rows remain.
    """
    if 'product_id' not in processed_df.columns or 'date' not in processed_df.columns:
        return None

    trend_df = processed_df.copy()
    trend_df['product_id'] = trend_df['product_id'].astype(str).str.strip()
    trend_df = trend_df[trend_df['product_id'] != '']
    trend_df['date'] = pd.to_datetime(trend_df['date'], errors='coerce')
    trend_df = trend_df.dropna(subset=['date'])

    if trend_df.empty:
        return None

    product_counts = trend_df.groupby('product_id').size().sort_values(ascending=False)
    # Include all products so the dropdown lists every available product.
    top_product_ids = [str(product_id) for product_id in product_counts.index.tolist()]

    products = {}
    for product_id in top_product_ids:
        product_group = trend_df[trend_df['product_id'] == product_id].copy()
        if product_group.empty:
            continue

        product_group['month'] = product_group['date'].dt.to_period('M').astype(str)

        month_rows = []
        for month, month_group in product_group.groupby('month'):
            month_dist = month_group[sentiment_col].value_counts()
            month_total = len(month_group)
            if month_total <= 0:
                continue

            # Each month row can be drawn directly in the per-product trend chart.
            month_rows.append({
                'month': str(month),
                'total': int(month_total),
                'positive': int(month_dist.get('positive', 0)),
                'neutral': int(month_dist.get('neutral', 0)),
                'negative': int(month_dist.get('negative', 0)),
                'positive_pct': round(month_dist.get('positive', 0) / month_total * 100, 1),
                'negative_pct': round(month_dist.get('negative', 0) / month_total * 100, 1),
            })

        if month_rows:
            products[product_id] = sorted(month_rows, key=lambda item: item['month'])

    if not products:
        return None

    return {
        # product_ids gives the frontend a stable selector order for chart series.
        'product_ids': list(products.keys()),
        'products': products,
        'total_products_with_dates': int(len(product_counts)),
        'excluded_products': int(max(0, len(product_counts) - len(products))),
    }
