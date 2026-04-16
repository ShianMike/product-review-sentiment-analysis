"""
Theme & Keyword Extraction Module
Extracts common themes, frequent complaints, and praises from reviews.
Uses TF-IDF and frequency-based keyword extraction.

Pipeline summary:
1. Compute global keywords and frequent n-gram phrases.
2. Repeat extraction by sentiment slice (positive/neutral/negative).
3. Produce complaint/praise buckets plus word-cloud frequency payload.

Demo mapping:
- Slide 7: Methods and Techniques Used
- Slide 10: Latest Demo Results for praises, complaints, and keywords
"""

from collections import Counter
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from nltk.corpus import stopwords


# ─── Stopword list ───────────────────────────────────────────────────────────────
# Extend NLTK stopwords with common null-like placeholders seen in exported datasets.
STOP_WORDS = set(stopwords.words('english')) | {'nan', 'none', 'null'}


# ─── Keyword & phrase extraction ──────────────────────────────────────────────────

def extract_keywords_tfidf(texts, top_n=20):
    """
        Extract top keywords from a corpus using TF-IDF scoring.

        Why TF-IDF is used here:
        - TF (term frequency) highlights words that appear often in review text.
        - IDF (inverse document frequency) downweights words that appear in almost every review.
        - The combination helps surface words that are both frequent and distinctive,
            which is more useful for theme summaries than raw counts alone.
    
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
    # Split sentiment buckets so complaints/praises can be shown independently in UI.
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
    
    # Count all words after lightweight token cleanup.
    all_words = []
    for text in texts:
        if isinstance(text, str):
            words = text.lower().split()
            words = [w for w in words if w not in STOP_WORDS and len(w) > 2 and w != 'nan']
            all_words.extend(words)
    
    word_counts = Counter(all_words)
    top_words = word_counts.most_common(top_n)
    
    return [{'text': word, 'value': count} for word, count in top_words]


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
    # word_cloud_data -> word cloud frequencies
    summary = {
        'overall_keywords': extract_keywords_tfidf(analysis_texts, top_n=20),
        'overall_phrases': extract_frequent_phrases(analysis_texts, top_n=15),
        'themes_by_sentiment': extract_themes_by_sentiment(
            analysis_texts, sentiment_labels, top_n=10
        ),
        'complaints_and_praises': extract_complaints_and_praises(
            analysis_texts, sentiment_labels, top_n=10
        ),
        'word_cloud_data': extract_word_cloud_data(analysis_texts, top_n=80)
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
