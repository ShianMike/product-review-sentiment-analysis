"""
[Backend Step 9 of 13] Product-Level Sentiment Aggregation

This file turns review-level predictions into product-level summaries.

Presentation flow:
- Step 1: Check whether the dataset has product IDs.
- Step 2: Count sentiment, ratings, confidence, and review volume per product.
- Step 3: Mark products that may need attention based on complaints/ratings.
- Step 4: Build product comparison rows and optional product trend data.
"""


import pandas as pd


def _sentiment_bucket(count, total):
    """Return one UI-ready sentiment bucket with count and percentage."""
    return {
        'count': int(count),
        'percentage': round((count / total) * 100, 1) if total else 0,
    }


def _dominant_sentiment(positive, neutral, negative):
    """Pick the sentiment bucket with the largest review count."""
    counts = {
        'positive': positive,
        'neutral': neutral,
        'negative': negative,
    }
    return max(counts.items(), key=lambda item: (item[1], item[0]))[0]


def _attention_score(negative_pct, neutral_pct, avg_rating):
    """
    Score how much a product may need seller attention.

    Negative sentiment is the primary signal. Neutral sentiment adds a small
    uncertainty penalty, and low average rating adds a bounded rating penalty
    when rating data exists.
    """
    rating_penalty = 0
    if avg_rating is not None:
        rating_penalty = max(0, min(20, (3.5 - avg_rating) * 10))
    score = negative_pct + (neutral_pct * 0.15) + rating_penalty
    return round(min(100, score), 1)


def _attention_level(score):
    """Map the numeric attention score to a short dashboard label."""
    if score >= 35:
        return 'High'
    if score >= 20:
        return 'Watch'
    return 'Low'


def _attention_reason(negative_pct, avg_rating):
    """Explain why the product was marked as needing attention."""
    if avg_rating is not None and avg_rating < 3.5:
        return f"{negative_pct}% negative reviews with {avg_rating} average rating."
    return f"{negative_pct}% negative reviews."


def _product_insight(product_id, total, positive_pct, neutral_pct, negative_pct, avg_rating, attention_level):
    """Return a clear seller-facing product quality insight."""
    rating_note = f" Average rating is {avg_rating}." if avg_rating is not None else ""
    if negative_pct >= 35:
        return (
            f"{product_id} needs attention: {negative_pct}% of {total} reviews are negative."
            f"{rating_note} Prioritize recurring complaints before scaling promotion."
        )
    if positive_pct >= 65 and negative_pct <= 15:
        return (
            f"{product_id} is performing well: {positive_pct}% of {total} reviews are positive."
            f"{rating_note} Preserve the strengths customers already praise."
        )
    if neutral_pct >= 30:
        return (
            f"{product_id} has mixed or undecided feedback: {neutral_pct}% of reviews are neutral."
            f"{rating_note} Clarify product expectations and inspect common hesitation points."
        )
    if attention_level == 'Watch':
        return (
            f"{product_id} should be watched: negative feedback is noticeable at {negative_pct}%."
            f"{rating_note} Review complaints before they become the dominant signal."
        )
    return (
        f"{product_id} has a stable sentiment mix across {total} reviews."
        f"{rating_note} Continue monitoring for new complaint patterns."
    )


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

        dominant_sentiment = _dominant_sentiment(positive, neutral, negative)
        sentiment_summary = {
            'positive': _sentiment_bucket(positive, total),
            'neutral': _sentiment_bucket(neutral, total),
            'negative': _sentiment_bucket(negative, total),
        }
        attention_score = _attention_score(negative_pct, neutral_pct, avg_rating)
        attention_level = _attention_level(attention_score)
        attention_reason = _attention_reason(negative_pct, avg_rating)

        # Each row becomes one product record for the ranking chart/table.
        rows.append({
            'product_id': product_id,
            'total_reviews': total,
            'review_count': total,
            'positive_count': positive,
            'neutral_count': neutral,
            'negative_count': negative,
            'positive_pct': positive_pct,
            'neutral_pct': neutral_pct,
            'negative_pct': negative_pct,
            'net_sentiment': round(positive_pct - negative_pct, 1),
            'avg_rating': avg_rating,
            'avg_confidence': avg_confidence,
            'dominant_sentiment': dominant_sentiment,
            'sentiment_summary': sentiment_summary,
            'attention_score': attention_score,
            'attention_level': attention_level,
            'attention_reason': attention_reason,
            'quality_insight': _product_insight(
                product_id,
                total,
                positive_pct,
                neutral_pct,
                negative_pct,
                avg_rating,
                attention_level,
            ),
        })

    if not rows:
        return None

    rows_sorted = sorted(rows, key=lambda item: (-item['total_reviews'], item['product_id']))

    # Prefer products with a minimum review count when picking "best" and
    # "needs attention" so a single outlier review does not dominate the callout.
    stable_pool = [item for item in rows if item['total_reviews'] >= 5]
    comparison_pool = stable_pool if stable_pool else rows

    top_positive = max(comparison_pool, key=lambda item: item['net_sentiment'])
    needs_attention = max(
        comparison_pool,
        key=lambda item: (item['attention_score'], item['negative_pct'], item['total_reviews'])
    )

    return {
        'total_products': len(rows),
        # All products included — the frontend handles display/pagination.
        'top_products': rows_sorted,
        # These records feed the top positive / needs attention highlight cards.
        'top_positive_product': {
            'product_id': top_positive['product_id'],
            'net_sentiment': top_positive['net_sentiment'],
            'total_reviews': top_positive['total_reviews'],
            'positive_pct': top_positive['positive_pct'],
            'negative_pct': top_positive['negative_pct'],
        },
        'needs_attention_product': {
            'product_id': needs_attention['product_id'],
            'attention_score': needs_attention['attention_score'],
            'attention_level': needs_attention['attention_level'],
            'attention_reason': needs_attention['attention_reason'],
            'negative_pct': needs_attention['negative_pct'],
            'avg_rating': needs_attention['avg_rating'],
            'net_sentiment': needs_attention['net_sentiment'],
            'total_reviews': needs_attention['total_reviews'],
        },
        # Backward-compatible alias for older frontend/export payload readers.
        'top_risk_product': {
            'product_id': needs_attention['product_id'],
            'attention_score': needs_attention['attention_score'],
            'attention_level': needs_attention['attention_level'],
            'attention_reason': needs_attention['attention_reason'],
            'negative_pct': needs_attention['negative_pct'],
            'avg_rating': needs_attention['avg_rating'],
            'net_sentiment': needs_attention['net_sentiment'],
            'total_reviews': needs_attention['total_reviews'],
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
