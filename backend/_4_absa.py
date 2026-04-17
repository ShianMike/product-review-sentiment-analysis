"""
[Pipeline Step 4 of 11] Aspect-Based Sentiment Analysis (ABSA)

Detects which product aspects (quality, price, delivery, taste, service,
appearance, usability) appear in each review and scores their sentiment
using TextBlob polarity.

Approach:
1. Match aspect keywords / phrases via pre-compiled boundary-aware regexes.
2. Isolate sentences mentioning the aspect and score them with TextBlob.
3. Aggregate per-review signals into dashboard-level summary metrics.

This is entirely rule-based — no learned aspect model — which keeps the
prototype transparent and easy to explain during a defense.

Demo mapping:
- Slide 7  : Methods and Techniques Used
- Slide 10 : Latest Demo Results — aspect summaries
- Q23-Q26 / Q47: ABSA definition, rule-based rationale, limitations, and
                  TextBlob's role in aspect-level scoring.
"""

import re
from collections import defaultdict
from textblob import TextBlob


# ─── Aspect keyword lexicons ─────────────────────────────────────────────────────
# Q24/Q25: Rule-based aspect detection is intentional — predefined keywords make
# the prototype easier to implement, explain, and verify during defense, even
# though it is less flexible than a learned aspect model.
#
# Keyword lexicons are broad to improve recall on varied review wording.
# Multi-word phrases (e.g. "waste of money") capture stronger, specific signals.
# Seven categories cover the most common e-commerce review dimensions.
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
    """
    Pre-compile boundary-aware regex patterns for each aspect keyword.

    Boundary checks avoid false positives from substring matches, such as
    matching "ship" inside unrelated words.
    """
    compiled = {}
    for aspect, keywords in aspect_keywords.items():
        compiled[aspect] = [
            # re.escape keeps literal phrase matching safe for punctuation/symbols.
            re.compile(rf'(?<!\w){re.escape(keyword)}(?!\w)', re.IGNORECASE)
            for keyword in keywords
        ]
    return compiled


# Compile all patterns once at import time; reusing pre-compiled patterns
# avoids redundant regex compilation on every function call.
ASPECT_PATTERNS = _compile_aspect_patterns(ASPECT_KEYWORDS)


# ─── Per-review ABSA functions ──────────────────────────────────────────────────


def detect_aspects(text):
    """
    Detect which aspects are mentioned in a review text.

    Returns:
    - List of aspect names detected at least once in the text.
    """
    if not isinstance(text, str):
        return []
    
    detected = []
    
    # Boundary-aware matches reduce accidental substring hits.
    for aspect, patterns in ASPECT_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(text):
                detected.append(aspect)
                # Stop at first hit for this aspect so it appears only once.
                break
    
    return detected


def get_aspect_sentiment(text, aspect):
    """
    Extract sentiment for one aspect from a review.

    Strategy:
    - Collect only sentences mentioning the aspect keywords.
    - Score each matched sentence with TextBlob polarity/subjectivity.
    - Fall back to full-text sentiment if no aspect-specific sentence is found.

    Returns polarity score (-1 to 1), subjectivity (0 to 1), and mapped label.
    """
    if not isinstance(text, str):
        return {'polarity': 0, 'subjectivity': 0, 'label': 'neutral'}
    
    # Q47: TextBlob is used here to score sentiment polarity for the matched
    # aspect context instead of only scoring the review as one whole block.
    patterns = ASPECT_PATTERNS.get(aspect, [])
    
    # Sentence-level filtering isolates aspect context in mixed-sentiment reviews.
    blob = TextBlob(text)
    aspect_sentences = []
    
    for sentence in blob.sentences:  # type: ignore[attr-defined]
        sentence_text = str(sentence)
        for pattern in patterns:
            if pattern.search(sentence_text):
                aspect_sentences.append(sentence)
                break
    
    if not aspect_sentences:
        # Q26: A rule-based keyword method can miss implicit references or
        # synonyms, so fallback sentiment on the full review keeps behavior
        # stable when no aspect-specific sentence is isolated.
        # If no direct aspect mention is found, use the full review as fallback.
        polarity = blob.sentiment.polarity  # type: ignore[attr-defined]
        subjectivity = blob.sentiment.subjectivity  # type: ignore[attr-defined]
    else:
        # Average over all matching sentences to smooth single-sentence outliers.
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
    Run ABSA for a single review.

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
    Perform ABSA on a batch of review texts.
    
    Returns:
    - aspect_results: list of dicts, one per review
    - aspect_summary: aggregated aspect sentiment summary sorted by mentions
    """
    aspect_results = []
    # defaultdict keeps aggregation code simple by auto-initializing counters.
    aspect_summary = defaultdict(lambda: {
        'count': 0,
        'positive': 0,
        'neutral': 0,
        'negative': 0,
        'total_polarity': 0,
        # Reserved for optional example snippets if needed later in the UI.
        'mentions': []
    })
    
    for text in texts:
        review_aspects = analyze_aspects(text)
        aspect_results.append(review_aspects)
        
        # Accumulate counts and polarity totals per detected aspect.
        for aspect, sentiment in review_aspects.items():
            summary = aspect_summary[aspect]
            summary['count'] += 1
            summary[sentiment['label']] += 1
            summary['total_polarity'] += sentiment['polarity']
    
    # Compute averages and format summary
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
    
    # Most-mentioned aspects appear first in dashboard summaries.
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
