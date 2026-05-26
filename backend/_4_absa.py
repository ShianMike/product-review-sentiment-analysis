"""
[Backend Step 4 of 13] Aspect-Based Sentiment Analysis (ABSA)

Rule-based aspect (topic) detection and sentiment scoring:
1. Aspect Keywords: Scans reviews for specific keywords representing categories (e.g. 'quality', 'price').
2. Sentence-Level sentiment: Isolates and scores only the specific sentences discussing an aspect.
3. Sentiment Labeling: Translates TextBlob polarity score (-1 to +1) into positive, neutral, or negative.
4. Aggregation: Compiles mention frequencies, polarity averages, and ratios for frontend charts.
"""

import re
from collections import defaultdict
from textblob import TextBlob


# ─── Aspect keyword lists ────────────────────────────────────────────────────────
# Defines the vocabulary mapping that triggers aspect detection. If a review contains
# one of these words or short phrases, that aspect is flagged as discussed.
ASPECT_KEYWORDS = {
    'quality': [
        'quality', 'durable', 'durability', 'sturdy', 'flimsy', 'cheap',
        'well made', 'well-made', 'poorly made', 'craftsmanship', 'build',
        'material', 'construction', 'solid', 'broken', 'defective', 'premium',
        'excellent', 'superior', 'inferior', 'good quality', 'bad quality',
        'high quality', 'low quality', 'top notch', 'subpar'
    ],
    'price': [
        'price', 'cost', 'value', 'expensive', 'cheap', 'affordable',
        'overpriced', 'worth', 'money', 'budget', 'deal', 'bargain',
        'rip off', 'ripoff', 'pricey', 'economical', 'reasonable',
        'good value', 'great value', 'waste of money', 'bang for buck',
        'dollar', 'savings', 'discount', 'pricy'
    ],
    'delivery': [
        'delivery', 'shipping', 'shipped', 'arrived', 'package', 'packaging',
        'tracking', 'courier', 'dispatch', 'transit', 'delayed', 'late',
        'fast shipping', 'slow shipping', 'on time', 'damaged in transit',
        'delivery time', 'ship', 'receive', 'received', 'box', 'wrap',
        'packed', 'postal', 'mail', 'fedex', 'ups', 'usps'
    ],
    'taste': [
        'taste', 'flavor', 'flavour', 'delicious', 'yummy', 'bland',
        'sweet', 'sour', 'bitter', 'salty', 'spicy', 'savory',
        'tasty', 'disgusting', 'nasty', 'fresh', 'stale', 'yuck',
        'mouth', 'tongue', 'palate', 'aroma', 'smell', 'odor',
        'appetizing', 'scrumptious', 'flavorful', 'tasteless'
    ],
    'service': [
        'service', 'customer service', 'support', 'help', 'response',
        'refund', 'return', 'replacement', 'warranty', 'complaint',
        'representative', 'agent', 'staff', 'team', 'assist',
        'responsive', 'unhelpful', 'helpful', 'rude', 'polite',
        'resolved', 'unresolved', 'contact', 'email', 'phone', 'chat'
    ],
    'appearance': [
        'look', 'looks', 'design', 'color', 'colour', 'size', 'shape',
        'appearance', 'beautiful', 'ugly', 'aesthetic', 'style', 'sleek',
        'compact', 'bulky', 'elegant', 'attractive', 'unattractive',
        'pretty', 'gorgeous', 'hideous', 'modern', 'classic', 'visual'
    ],
    'usability': [
        'easy', 'difficult', 'hard', 'simple', 'intuitive', 'complicated',
        'user friendly', 'user-friendly', 'convenient', 'inconvenient',
        'setup', 'install', 'installation', 'instructions', 'manual',
        'confusing', 'straightforward', 'use', 'using', 'works',
        'functional', 'practical', 'handy', 'usable', 'unusable'
    ]
}


# ─── Pattern compilation ─────────────────────────────────────────────────────────

def _compile_aspect_patterns(aspect_keywords):
    r"""
    Compiles list of keywords for each aspect into boundary-aware regex patterns.

    Using word boundaries (e.g. (?<!\w)...(?!\w)) prevents partial substring matches,
    ensuring a keyword like "ship" does not falsely match on words like "shipping" or "relationship".
    """
    compiled = {}
    for aspect, keywords in aspect_keywords.items():
        compiled[aspect] = [
            # re.escape makes sure punctuation in the keyword is treated as a
            # plain character, not as a regex symbol.
            re.compile(rf'(?<!\w){re.escape(keyword)}(?!\w)', re.IGNORECASE)
            for keyword in keywords
        ]
    return compiled


# Pre-compile the regex objects once at module import. Reusing compiled patterns
# prevents redundant recompilation overhead for every review analyzed.
ASPECT_PATTERNS = _compile_aspect_patterns(ASPECT_KEYWORDS)


# ─── Per-review ABSA functions ──────────────────────────────────────────────────


def detect_aspects(text):
    """
    Scans a single review text and returns all aspects mentioned in it.

    Checks keyword list patterns sequentially. Once an aspect is matched, we stop checking
    its remaining keywords to avoid duplicating the aspect flag for a single review.
    """
    if not isinstance(text, str):
        return []

    detected = []

    # Whole-word matching reduces wrong matches like "ship" inside "shipping".
    for aspect, patterns in ASPECT_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(text):
                detected.append(aspect)
                # One match is enough. Stop checking the rest of the keywords
                # for this aspect so it only shows up once in the result.
                break

    return detected


def get_aspect_sentiment(text, aspect):
    """
    Determines sentiment polarity and label for a specific aspect in a review.

    Instead of scoring the entire review, we only score sentences containing aspect keywords.
    This provides target-level sentiment (e.g. in "taste is good but service was poor", 'taste'
    scores positive while 'service' scores negative). Falls back to whole-text if no sentence matches.
    """
    if not isinstance(text, str):
        return {'polarity': 0, 'subjectivity': 0, 'label': 'neutral'}

    # Score only the specific sentences discussing the aspect.
    patterns = ASPECT_PATTERNS.get(aspect, [])

    # Extract sentences mentioning the aspect.
    blob = TextBlob(text)
    aspect_sentences = []

    for sentence in blob.sentences:  # type: ignore[attr-defined]
        sentence_text = str(sentence)
        for pattern in patterns:
            if pattern.search(sentence_text):
                aspect_sentences.append(sentence)
                break

    if not aspect_sentences:
        # Fallback to whole review if no clear sentence boundary matches.
        polarity = blob.sentiment.polarity  # type: ignore[attr-defined]
        subjectivity = blob.sentiment.subjectivity  # type: ignore[attr-defined]
    else:
        # Average the scores if multiple sentences match.
        polarities = [s.sentiment.polarity for s in aspect_sentences]
        subjectivities = [s.sentiment.subjectivity for s in aspect_sentences]
        polarity = sum(polarities) / len(polarities)
        subjectivity = sum(subjectivities) / len(subjectivities)

    # Use a small neutral band around zero to avoid noisy flips.
    if polarity > 0.1:
        label = 'positive'
    elif polarity < -0.1:
        label = 'negative'
    else:
        label = 'neutral'

    return {
        'polarity': round(polarity, 4),
        'subjectivity': round(subjectivity, 4),
        'label': label
    }


def analyze_aspects(text):
    """
    Run aspect detection and aspect sentiment for one review.

    Returns:
    - Dict mapping each detected aspect to its sentiment payload.
    """
    detected = detect_aspects(text)
    results = {}

    for aspect in detected:
        results[aspect] = get_aspect_sentiment(text, aspect)

    return results


# ─── Batch aggregation ─────────────────────────────────────────────────────────────

def analyze_aspects_batch(texts):
    """
    Processes a list of review texts, running aspect detection and sentiment scoring on each.

    Aggregates overall statistics: total mentions, positive/neutral/negative counts,
    sentiment percentages, and average polarity scores. Sorted by popularity descending.
    """
    aspect_results = []
    # Accumulates aspect mention counts, positive/neutral/negative flags, and sentiment scores.
    aspect_summary = defaultdict(lambda: {
        'count': 0,
        'positive': 0,
        'neutral': 0,
        'negative': 0,
        'total_polarity': 0,
        # Empty list kept for example sentences in case we add them later.
        'mentions': []
    })

    for text in texts:
        review_aspects = analyze_aspects(text)
        aspect_results.append(review_aspects)

        # For every aspect found in this review, add 1 to its total, add 1
        # to the matching sentiment, and add the polarity score.
        for aspect, sentiment in review_aspects.items():
            summary = aspect_summary[aspect]
            summary['count'] += 1
            summary[sentiment['label']] += 1
            summary['total_polarity'] += sentiment['polarity']

    # Formulates counts into final percentages and computes the average polarity.
    formatted_summary = {}
    for aspect, data in aspect_summary.items():
        count = data['count']
        formatted_summary[aspect] = {
            'total_mentions': count,
            'positive_count': data['positive'],
            'neutral_count': data['neutral'],
            'negative_count': data['negative'],
            'positive_pct': round(data['positive'] / count * 100, 1) if count > 0 else 0,
            'neutral_pct': round(data['neutral'] / count * 100, 1) if count > 0 else 0,
            'negative_pct': round(data['negative'] / count * 100, 1) if count > 0 else 0,
            'avg_polarity': round(data['total_polarity'] / count, 4) if count > 0 else 0
        }

    # Sorts the final aspect list so the most-mentioned aspects are returned first.
    formatted_summary = dict(
        sorted(formatted_summary.items(), key=lambda x: x[1]['total_mentions'], reverse=True)
    )

    return aspect_results, formatted_summary


# ─── Quick self-test (run: python absa.py) ────────────────────────────────────────

if __name__ == '__main__':
    # Quick test
    sample_reviews = [
        "The taste is amazing but the delivery was very slow. Took 3 weeks!",
        "Great value for the price. Build quality is solid and durable.",
        "Customer service was rude. The product looks beautiful though.",
        "Easy to use and setup. Instructions were clear and straightforward."
    ]

    for review in sample_reviews:
        print(f"\nReview: {review}")
        aspects = analyze_aspects(review)
        for aspect, sentiment in aspects.items():
            print(f"  {aspect}: {sentiment['label']} (polarity: {sentiment['polarity']})")
