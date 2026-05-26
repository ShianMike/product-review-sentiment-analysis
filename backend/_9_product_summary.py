"""
[Backend Step 9 of 13] Product-Level Sentiment

This file turns the review-by-review results into one row per product, so the
dashboard can show how each product is doing.

What it does, step by step:
- Step 1: Check if the file has a product_id column. If not, stop early.
- Step 2: Group the reviews by product_id and count positive, neutral, and
          negative reviews, plus average rating and average confidence.
- Step 3: Add a small "needs attention" score so the dashboard can flag
          products with many complaints or low ratings.
- Step 4: Build the rows for the product comparison table and, if the file
          has dates, build a monthly trend for each product.
"""


import pandas as pd


def _sentiment_bucket(count, total):
    """Return one small object with the count and percentage for one sentiment.

    The dashboard reads this directly into the positive / neutral / negative
    cards, so the format matches what the frontend already expects.
    """
    return {
        'count': int(count),
        'percentage': round((count / total) * 100, 1) if total else 0,
    }


def _dominant_sentiment(positive, neutral, negative):
    """Return the name of the sentiment with the most reviews."""
    counts = {
        'positive': positive,
        'neutral': neutral,
        'negative': negative,
    }
    return max(counts.items(), key=lambda item: (item[1], item[0]))[0]


def _attention_score(negative_pct, neutral_pct, avg_rating):
    """
    Give the product a simple score that says "how much should the seller
    pay attention to this?".

    The score uses three signals:
    - Negative percentage is the main signal (more complaints = higher score).
    - Neutral percentage adds a small extra (mixed reviews are also a hint).
    - Low average rating adds a small extra when rating data is available.
    """
    rating_penalty = 0
    if avg_rating is not None:
        rating_penalty = max(0, min(20, (3.5 - avg_rating) * 10))
    score = negative_pct + (neutral_pct * 0.15) + rating_penalty
    return round(min(100, score), 1)


def _attention_level(score):
    """Turn the number from _attention_score into a short label
    (High, Watch, or Low) so the dashboard can show it as a tag."""
    if score >= 35:
        return 'High'
    if score >= 20:
        return 'Watch'
    return 'Low'


def _attention_reason(negative_pct, avg_rating):
    """Write one short sentence that says why the product needs attention."""
    if avg_rating is not None and avg_rating < 3.5:
        return f"{negative_pct}% negative reviews with {avg_rating} average rating."
    return f"{negative_pct}% negative reviews."


def _product_insight(product_id, total, positive_pct, neutral_pct, negative_pct, avg_rating, attention_level):
    """Write one short, easy-to-read sentence about the product so the
    seller can quickly see if the product is doing well or has problems."""
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
    Take the per-review results and group them by product, so the dashboard
    can show how each product is doing.

    For each product we count positive, neutral, and negative reviews and
    work out the percentages, average rating, and a short insight sentence.
    All products are returned so the dashboard dropdown can list every one.

    Returns None if the file has no product_id column or all values are empty.
    """
    if 'product_id' not in processed_df.columns:
        return None

    product_df = processed_df.copy()
    product_df['product_id'] = product_df['product_id'].astype(str).str.strip()
    product_df = product_df[product_df['product_id'] != '']

    if product_df.empty:
        return None

    rows = []
    # Group all reviews by product_id, then build one row per product.
    for product_id, group in product_df.groupby('product_id'):
        total = len(group)
        if total <= 0:
            continue

        # Count how many reviews fall into each sentiment for this product.
        sentiment_dist = group[sentiment_col].value_counts()
        positive = int(sentiment_dist.get('positive', 0))
        neutral = int(sentiment_dist.get('neutral', 0))
        negative = int(sentiment_dist.get('negative', 0))

        # Turn the counts into percentages so the table can show them as %.
        positive_pct = round((positive / total) * 100, 1)
        neutral_pct = round((neutral / total) * 100, 1)
        negative_pct = round((negative / total) * 100, 1)

        # Average star rating for this product, if the file had a rating column.
        avg_rating = None
        if 'rating' in group.columns:
            valid_ratings = group['rating'].dropna()
            if not valid_ratings.empty:
                avg_rating = round(float(valid_ratings.mean()), 2)

        # Average model confidence for this product, used for transparency.
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

        # Save one row of numbers per product. The dashboard reads this list
        # into the Product-Level Sentiment table and the product dropdown.
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

    # Sort products so the ones with the most reviews show up first.
    rows_sorted = sorted(rows, key=lambda item: (-item['total_reviews'], item['product_id']))

    # When picking the "best" and "needs attention" products, only use products
    # with at least 5 reviews. This stops a single review from making a tiny
    # product look like the best or worst in the whole file.
    stable_pool = [item for item in rows if item['total_reviews'] >= 5]
    comparison_pool = stable_pool if stable_pool else rows

    top_positive = max(comparison_pool, key=lambda item: item['net_sentiment'])
    needs_attention = max(
        comparison_pool,
        key=lambda item: (item['attention_score'], item['negative_pct'], item['total_reviews'])
    )

    return {
        'total_products': len(rows),
        # All products are included here. The dashboard chooses how many to show.
        'top_products': rows_sorted,
        # The two records below are used by the highlight cards on the dashboard:
        # "Top Positive Product" and "Needs Attention Product".
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
        # Old name kept here so older parts of the frontend or export files do
        # not break when reading the result.
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
    Builds month-by-month sentiment timelines for each individual product.

    This enables the frontend dashboard's product filter to display product-specific
    sentiment trends (e.g. tracking if complaints spike for a specific SKU after a certain month)
    rather than showing only the global aggregate dataset.

    Args:
        processed_df (pd.DataFrame): The preprocessed reviews DataFrame.
        sentiment_col (str): Column name representing predicted sentiment levels
                             ('positive', 'neutral', 'negative').

    Returns:
        dict: A structured payload mapping product IDs to sorted monthly timeline arrays,
              or None if date/product information is unavailable.
    """
    # Step 1: Pre-flight check. Ensure both product identifiers and review dates exist.
    # If either column is missing, product-level time-series tracking is impossible.
    if 'product_id' not in processed_df.columns or 'date' not in processed_df.columns:
        return None

    # Step 2: Create a copy to prevent side effects on the main dataset.
    trend_df = processed_df.copy()

    # Step 3: Clean product IDs by stripping leading and trailing whitespaces,
    # and filter out any empty string IDs.
    trend_df['product_id'] = trend_df['product_id'].astype(str).str.strip()
    trend_df = trend_df[trend_df['product_id'] != '']

    # Step 4: Coerce review dates to pandas Datetime objects.
    # Invalid or corrupt date formats are safely coerced to NaT (Not a Time) values,
    # and then dropped so they don't break subsequent year-month grouping functions.
    trend_df['date'] = pd.to_datetime(trend_df['date'], errors='coerce')
    trend_df = trend_df.dropna(subset=['date'])

    # If dropping invalid dates left us with an empty dataset, exit early.
    if trend_df.empty:
        return None

    # Step 5: Count reviews per product and sort them in descending order.
    # Grouping by review count lets us list the most-reviewed products first.
    # This design decision ensures the frontend product dropdown places high-volume
    # items at the top of the list, since they are the ones users care about most.
    product_counts = trend_df.groupby('product_id').size().sort_values(ascending=False)
    top_product_ids = [str(product_id) for product_id in product_counts.index.tolist()]

    products = {}

    # Step 6: Loop through products to compile their individual monthly aggregates.
    for product_id in top_product_ids:
        # Extract reviews belonging to the current product ID.
        product_group = trend_df[trend_df['product_id'] == product_id].copy()
        if product_group.empty:
            continue

        # Group by year-month period (e.g. "2026-05").
        product_group['month'] = product_group['date'].dt.to_period('M').astype(str)

        month_rows = []

        # Step 7: For each month, compute positive, neutral, and negative metrics.
        for month, month_group in product_group.groupby('month'):
            month_dist = month_group[sentiment_col].value_counts()
            month_total = len(month_group)
            if month_total <= 0:
                continue

            # Store the monthly snapshot for this product.
            # Counts are explicitly cast to integers to prevent JSON serialization errors.
            month_rows.append({
                'month': str(month),
                'total': int(month_total),
                'positive': int(month_dist.get('positive', 0)),
                'neutral': int(month_dist.get('neutral', 0)),
                'negative': int(month_dist.get('negative', 0)),
                'positive_pct': round(month_dist.get('positive', 0) / month_total * 100, 1),
                'negative_pct': round(month_dist.get('negative', 0) / month_total * 100, 1),
            })

        # Step 8: Sort the product's timeline chronologically.
        # String sorting matches chronological order since months are formatted as YYYY-MM.
        if month_rows:
            products[product_id] = sorted(month_rows, key=lambda item: item['month'])

    if not products:
        return None

    # Step 9: Return structured trends data matching what the frontend component expects.
    return {
        # product_ids preserves the volume-sorted list order for the filter dropdown.
        'product_ids': list(products.keys()),
        'products': products,
        'total_products_with_dates': int(len(product_counts)),
        'excluded_products': int(max(0, len(product_counts) - len(products))),
    }
