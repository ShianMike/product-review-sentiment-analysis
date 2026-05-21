"""
[Backend Step 7 of 13] Theme & Keyword Extraction

How this module fulfills Project.txt requirements:
- Objective 2.2.3 and Scope 3.1: extracts keywords, recurring phrases,
  complaints, praises, and word-cloud data for the Themes dashboard tab.
- Conceptual Framework: complements predefined ABSA categories with broader
  corpus-level themes that can reveal issues outside the seven aspect buckets.

Code process:
- Step 1: Rank distinctive review keywords with TF-IDF.
- Step 2: Count recurring bigram/trigram phrases.
- Step 3: Split praise and complaint language by predicted sentiment bucket.
- Step 4: Return keyword, phrase, and word-cloud payloads for the Themes tab.

Research grounding:
- TF-IDF keyword ranking and n-gram phrase counts follow classical text-mining
  techniques commonly used in sentiment-analysis pipelines, as summarized by
  Tan et al. (2023) and Mao et al. (2024).
- Separating praise and complaint themes by predicted sentiment operationalizes
  the opinion-mining idea described by Liu (2012): extract not only polarity,
  but also the opinion targets and recurring language behind that polarity.
"""

from collections import Counter
import re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from nltk.corpus import stopwords


# ─── Stopword list ───────────────────────────────────────────────────────────────
# Extend NLTK stopwords with common null-like placeholders seen in exported datasets.
NEGATION_WORDS = {'not', 'no', 'nor', 'never'}
PLACEHOLDER_WORDS = {'nan', 'none', 'null'}


def _load_stop_words():
    try:
        return set(stopwords.words('english'))
    except LookupError:
        return {
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
            'has', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to',
            'was', 'were', 'with'
        }


STOP_WORDS = (_load_stop_words() - NEGATION_WORDS) | PLACEHOLDER_WORDS
NEGATION_SKIP_WORDS = STOP_WORDS - PLACEHOLDER_WORDS
WORD_RE = re.compile(r"[a-z0-9']+")

# ─── Keyword & phrase extraction ──────────────────────────────────────────────────

def extract_keywords_tfidf(texts, top_n=20):
    """
    Extract top keywords from a corpus using TF-IDF scoring.

    Requirement mapping:
    - Feeds the Themes tab keyword list, praise/complaint cards, aspect theme
      summaries, and keyword/theme filters in the Reviews tab.

    Why TF-IDF is used here:
    - TF highlights words that appear often in review text.
    - IDF downweights words that appear in almost every review.
    - The combination surfaces terms that are frequent and distinctive, which
      is more useful for theme summaries than raw counts alone.
    
    Parameters:
    - texts: list of preprocessed review texts
    - top_n: number of top keywords to return
    
    Returns:
    - List of (keyword, tfidf_score) tuples
    """
    if not texts or len(texts) == 0:
        return []
    
    custom_stop = list(STOP_WORDS)
    # TF-IDF vectorization happens in this block. It converts text into weighted
    # numeric features so we can rank keywords by importance, not just frequency.
    # Use unigrams+bigrams to capture both single terms and short product phrases.
    vectorizer = TfidfVectorizer(
        max_features=5000,
        ngram_range=(1, 2),
        min_df=3,
        max_df=0.9,
        stop_words=custom_stop
    )
    
    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
    except ValueError:
        # Return empty output for degenerate corpora (for example all-stopword input).
        return []
    
    # Average per-term TF-IDF across all documents to get corpus-level theme signals.
    # Terms with larger mean scores are treated as stronger dashboard keywords.
    avg_scores = np.asarray(tfidf_matrix.mean(axis=0)).flatten()  # type: ignore[union-attr]
    feature_names = vectorizer.get_feature_names_out()
    
    # Sort by score
    top_indices = avg_scores.argsort()[-top_n:][::-1]
    keywords = [(feature_names[i], round(float(avg_scores[i]), 4)) for i in top_indices]
    
    return keywords


def extract_frequent_phrases(texts, top_n=15):
    """
    Extract most frequent bigrams/trigrams from review texts.

    Phrase extraction complements TF-IDF by surfacing recurring multi-word issues
    and strengths that are easier to explain in dashboards.
    """
    if not texts or len(texts) == 0:
        return []
    
    custom_stop = list(STOP_WORDS)
    # Focus on phrase-level signals that usually describe concrete issues/features.
    vectorizer = CountVectorizer(
        ngram_range=(2, 3),
        min_df=3,
        max_df=0.8,
        stop_words=custom_stop,
        max_features=3000
    )
    
    try:
        count_matrix = vectorizer.fit_transform(texts)
    except ValueError:
        # Keep behavior consistent with other extractors on sparse/invalid input.
        return []
    
    # Sum counts for each phrase
    phrase_counts = np.asarray(count_matrix.sum(axis=0)).flatten()  # type: ignore[union-attr]
    feature_names = vectorizer.get_feature_names_out()
    
    # Sort by frequency
    top_indices = phrase_counts.argsort()[-top_n:][::-1]
    phrases = [(feature_names[i], int(phrase_counts[i])) for i in top_indices]
    
    return phrases


# ─── Sentiment-sliced theme extraction ───────────────────────────────────────────────

def extract_themes_by_sentiment(texts, sentiment_labels, top_n=10):
    """
    Extract top keywords/themes separated by sentiment category.
    
    Returns:
    - Dict with 'positive', 'neutral', 'negative' keys,
      each containing top keywords for that sentiment.
    """
    themes = {}
    
    for sentiment in ['positive', 'neutral', 'negative']:
        # Filter texts by sentiment
        filtered = [t for t, s in zip(texts, sentiment_labels) if s == sentiment]
        
        if len(filtered) < 5:
            # Very small slices are too noisy; return metadata with empty lists.
            themes[sentiment] = {
                'keywords': [],
                'phrases': [],
                'count': len(filtered)
            }
            continue
        
        keywords = extract_keywords_tfidf(filtered, top_n=top_n)
        phrases = extract_frequent_phrases(filtered, top_n=top_n)
        
        themes[sentiment] = {
            'keywords': keywords,
            'phrases': phrases,
            'count': len(filtered)
        }
    
    return themes


# ─── Complaint & praise extraction ──────────────────────────────────────────────────

def extract_complaints_and_praises(texts, sentiment_labels, top_n=10):
    """
    Extract the top complaint themes (from negative reviews) 
    and praise themes (from positive reviews).
    
    Returns dict with 'complaints' and 'praises' keys.
    """
    # Separating praise and complaint themes helps Project.txt's target users
    # identify repeated strengths and pain points without reading every review.
    complaints_texts = [t for t, s in zip(texts, sentiment_labels) if s == 'negative']
    praises_texts = [t for t, s in zip(texts, sentiment_labels) if s == 'positive']
    
    # Keep both buckets in a symmetric schema so frontend cards can reuse rendering code.
    result = {
        'complaints': {
            'count': len(complaints_texts),
            'keywords': extract_keywords_tfidf(complaints_texts, top_n=top_n),
            'phrases': extract_frequent_phrases(complaints_texts, top_n=top_n)
        },
        'praises': {
            'count': len(praises_texts),
            'keywords': extract_keywords_tfidf(praises_texts, top_n=top_n),
            'phrases': extract_frequent_phrases(praises_texts, top_n=top_n)
        }
    }
    
    return result


# ─── Word-cloud data ───────────────────────────────────────────────────────────────

def extract_word_cloud_data(texts, top_n=50):
    """
    Extract word frequency data suitable for word cloud visualization.
    Returns list of {text, value} dicts.
    """
    if not texts or len(texts) == 0:
        return []
    
    # Count all words after lightweight token cleanup. Negated phrases are
    # kept together so "not good" does not become a misleading positive term.
    all_words = []
    for text in texts:
        if isinstance(text, str):
            all_words.extend(_word_cloud_terms(text))
    
    word_counts = Counter(all_words)
    top_words = word_counts.most_common(top_n)
    
    return [{'text': word, 'value': count} for word, count in top_words]


def _word_cloud_terms(text):
    """Return word-cloud terms while preserving negated complaint phrases."""
    words = WORD_RE.findall(text.lower())
    terms = []
    i = 0

    while i < len(words):
        word = words[i]

        if word in NEGATION_WORDS:
            j = i + 1
            while j < len(words) and words[j] in NEGATION_SKIP_WORDS:
                j += 1

            if j < len(words):
                target = words[j]
                if target not in PLACEHOLDER_WORDS and len(target) > 2:
                    terms.append(f"{word} {target}")
                    i = j + 1
                    continue

            terms.append(word)
            i += 1
            continue

        if word not in STOP_WORDS and len(word) > 2 and word not in PLACEHOLDER_WORDS:
            terms.append(word)

        i += 1

    return terms


def extract_word_clouds_by_sentiment(texts, sentiment_labels, top_n=50):
    """
    Build separate word-cloud frequency payloads for praise and complaint text.

    Positive reviews feed the praise cloud. Negative reviews feed the complaint
    cloud. The overall cloud is kept for backward-compatible dashboards.
    """
    positive_texts = [t for t, s in zip(texts, sentiment_labels) if s == 'positive']
    negative_texts = [t for t, s in zip(texts, sentiment_labels) if s == 'negative']

    return {
        'praises': extract_word_cloud_data(positive_texts, top_n=top_n),
        'complaints': extract_word_cloud_data(negative_texts, top_n=top_n),
        'overall': extract_word_cloud_data(texts, top_n=top_n),
    }


# ─── Unified theme summary (called by the dashboard API) ─────────────────────────

def generate_theme_summary(texts, sentiment_labels, processed_texts=None):
    """
    Generate a comprehensive theme summary from reviews.
    
    Parameters:
    - texts: original review texts (for ABSA/readability)
    - sentiment_labels: predicted sentiment labels
    - processed_texts: preprocessed texts (for TF-IDF keyword extraction)
    
    Returns complete theme analysis dict with stable keys for API consumers.
    """
    # TF-IDF works best on normalized/clean text; use preprocessed text when provided.
    analysis_texts = processed_texts if processed_texts is not None else texts
    
    # Build all theme artifacts in one pass so callers receive a stable response
    # schema. Each key maps to a specific visualization block in the dashboard:
    # overall_keywords -> keyword chips/list
    # overall_phrases -> recurring phrase panels
    # themes_by_sentiment -> sentiment-specific breakdown cards/tabs
    # complaints_and_praises -> praise/complaint summary cards
    # word_clouds -> sentiment-specific praise and complaint word clouds
    # word_cloud_data -> legacy overall word cloud frequencies
    word_clouds = extract_word_clouds_by_sentiment(
        analysis_texts, sentiment_labels, top_n=80
    )
    summary = {
        'overall_keywords': extract_keywords_tfidf(analysis_texts, top_n=20),
        'overall_phrases': extract_frequent_phrases(analysis_texts, top_n=15),
        'themes_by_sentiment': extract_themes_by_sentiment(
            analysis_texts, sentiment_labels, top_n=10
        ),
        'complaints_and_praises': extract_complaints_and_praises(
            analysis_texts, sentiment_labels, top_n=10
        ),
        'word_clouds': word_clouds,
        'word_cloud_data': word_clouds['overall']
    }
    
    return summary


if __name__ == '__main__':
    # Quick test
    sample_texts = [
        "great taste love flavor delicious",
        "terrible quality broke after week",
        "fast shipping good packaging arrived quickly",
        "amazing product great quality recommend",
        "awful taste disgusting flavor never again",
        "good value price reasonable affordable great deal"
    ]
    sample_labels = ['positive', 'negative', 'positive', 'positive', 'negative', 'positive']
    
    result = extract_complaints_and_praises(sample_texts, sample_labels, top_n=5)
    print("Complaints:", result['complaints']['keywords'])
    print("Praises:", result['praises']['keywords'])
