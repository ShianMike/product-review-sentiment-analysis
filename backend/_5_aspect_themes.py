"""
[Backend Step 5 of 13] Aspect-Level Complaint & Praise Extraction

Groups reviews based on which aspects they mention and what sentiment label
they received. Then, it extracts the most common keywords and phrases from those
sentiment subgroups to power the praises/complaints cards on the dashboard.
"""

from collections import defaultdict

from _7_themes import extract_keywords_tfidf, extract_frequent_phrases


def build_aspect_theme_summary(processed_texts, aspect_results, top_n=8):
    """
    Groups reviews by aspect and sentiment, and extracts top keywords and common phrases.

    This function separates review texts mentioning an aspect into positive (praises) and negative (complaints)
    buckets, then performs TF-IDF keyword extraction and bigram/trigram count vectorization on each bucket.
    """
    if not processed_texts or not aspect_results:
        return {}

    buckets = defaultdict(lambda: {
        'positive': [],
        'negative': [],
        'neutral': [],
    })

    for text, review_aspects in zip(processed_texts, aspect_results):
        if not isinstance(review_aspects, dict) or not isinstance(text, str) or not text.strip():
            continue

        for aspect, sentiment_info in review_aspects.items():
            label = (sentiment_info or {}).get('label', 'neutral')
            if label not in {'positive', 'negative', 'neutral'}:
                label = 'neutral'
            buckets[aspect][label].append(text)

    aspect_theme_summary = {}
    for aspect, bucket in buckets.items():
        positive_texts = bucket['positive']
        negative_texts = bucket['negative']
        neutral_texts = bucket['neutral']

        aspect_theme_summary[aspect] = {
            'total_mentions': len(positive_texts) + len(negative_texts) + len(neutral_texts),
            'neutral_mentions': len(neutral_texts),
            # These sentiment-specific buckets contain the extracted terms that feed the
            # aspect detail card, highlighting strengths (praises) and issue areas (complaints).
            'praises': {
                'count': len(positive_texts),
                'keywords': extract_keywords_tfidf(positive_texts, top_n=top_n),
                'phrases': extract_frequent_phrases(positive_texts, top_n=min(top_n, 6)),
            },
            'complaints': {
                'count': len(negative_texts),
                'keywords': extract_keywords_tfidf(negative_texts, top_n=top_n),
                'phrases': extract_frequent_phrases(negative_texts, top_n=min(top_n, 6)),
            },
        }

    # Sorts the aspects so that the topics discussed most frequently are displayed first in the UI.
    return dict(
        sorted(
            aspect_theme_summary.items(),
            key=lambda item: item[1]['total_mentions'],
            reverse=True,
        )
    )
