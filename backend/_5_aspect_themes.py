"""
[Pipeline Step 5 of 11] Aspect-Level Complaint & Praise Extraction

Builds on Steps 4 (ABSA) and 7 (theme extraction) to produce per-aspect
complaint and praise keyword summaries. For each detected aspect, reviews
are grouped by sentiment label and then fed through TF-IDF keyword and
phrase extractors to surface what users praise or complain about most.

Consumes:
- Processed review texts (from Step 2)
- Per-review aspect-sentiment dicts (from Step 4)
- Keyword / phrase extractors (from Step 7)

Produces:
- aspect_theme_summary dict used by the Aspect Analysis dashboard section.
"""

from collections import defaultdict

from _7_themes import extract_keywords_tfidf, extract_frequent_phrases


def build_aspect_theme_summary(processed_texts, aspect_results, top_n=8):
    """
    Build complaint/praise summaries for each aspect from ABSA outputs.

    Parameters:
    - processed_texts: cleaned/normalized review texts aligned to aspect_results
    - aspect_results: list of per-review aspect sentiment dicts
    - top_n: keyword/phrase cap per bucket
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
            # These buckets feed the aspect insight cards that summarize what users
            # praise most and complain about most for each detected aspect.
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

    # Sort by mention volume so the UI surfaces the most-discussed aspects first.
    return dict(
        sorted(
            aspect_theme_summary.items(),
            key=lambda item: item[1]['total_mentions'],
            reverse=True,
        )
    )
