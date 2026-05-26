"""
[Backend Step 7 of 13] Theme & Keyword Extraction

Identifies overall stand-out keywords using TF-IDF, recurring multi-word phrases using CountVectorizer,
and builds sentiment-grouped outputs to drive word clouds and tabbed lists.
"""

from collections import Counter
import re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from nltk.corpus import stopwords


# ─── Stopword list ───────────────────────────────────────────────────────────────
# Combines NLTK english stop words with data placeholder terms (e.g. 'nan', 'null')
# while keeping negations (e.g. 'not', 'never') since they alter phrase sentiment.
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
    Ranks stand-out words and bigrams across the review dataset using TF-IDF scoring.

    TF-IDF highlights words that are highly frequent within these specific reviews but
    infrequent across general language usage, effectively filtering out common filler words.
    """
    if not texts or len(texts) == 0:
        return []

    custom_stop = list(STOP_WORDS)
    # Instantiate TF-IDF vectorizer. We allow single words (unigrams) and 2-word phrases (bigrams)
    # to capture context-dependent phrases like "battery life" or "customer support".
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
        # If the input is empty or only stopwords, just return an empty list.
        return []

    # Computes the average TF-IDF weight for each keyword vocabulary term across the entire text corpus.
    avg_scores = np.asarray(tfidf_matrix.mean(axis=0)).flatten()  # type: ignore[union-attr]
    feature_names = vectorizer.get_feature_names_out()

    # Identifies and returns the top-N highest scoring keywords, rounded for precision.
    top_indices = avg_scores.argsort()[-top_n:][::-1]
    keywords = [(feature_names[i], round(float(avg_scores[i]), 4)) for i in top_indices]

    return keywords


def extract_frequent_phrases(texts, top_n=15):
    """
    Extracts and counts recurring multi-word phrases (2-word bigrams and 3-word trigrams).

    Phrase extraction complements TF-IDF by capturing concrete descriptors (e.g., "customer service")
    which are much easier for non-technical users to quickly interpret than solitary keywords.
    """
    if not texts or len(texts) == 0:
        return []

    custom_stop = list(STOP_WORDS)
    # Configure token counter. Ignores single words, focusing entirely on multi-word patterns.
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
    Groups reviews by predicted sentiment and extracts top keywords/phrases for each group.

    Powers the 'Keywords by Sentiment' tabbed layout where users can inspect positive, negative, and
    neutral vocabulary splits side-by-side.
    """
    themes = {}

    for sentiment in ['positive', 'neutral', 'negative']:
        # Collects reviews matching the target sentiment label.
        filtered = [t for t, s in zip(texts, sentiment_labels) if s == sentiment]

        if len(filtered) < 5:
            # Skips extraction for small cohorts to prevent sparse, noisy keyword listings.
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
    Extracts complaint terms from negative reviews and praise terms from positive reviews.

    Maintains a symmetric schema mapping so the frontend can easily compare strengths and weaknesses.
    """
    # Segregates reviews into positive (praise) and negative (complaint) texts.
    complaints_texts = [t for t, s in zip(texts, sentiment_labels) if s == 'negative']
    praises_texts = [t for t, s in zip(texts, sentiment_labels) if s == 'positive']

    # Bundles the extracted keywords and common bigram/trigram phrases for both lists.
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
    Extracts term frequencies for the top distinct words, formatted for word cloud rendering.

    Calculates raw term occurrences. The frontend normalizes these counts to compute relative font sizes.
    """
    if not texts or len(texts) == 0:
        return []

    # Tokenizes and counts terms. Negations are kept together (e.g. "not good" instead of "not" and "good")
    # to prevent negative comments from falsely showing up as positive keywords.
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
    Builds separate word cloud frequency mappings for positive (praise) and negative (complaint) reviews.

    Splitting positive and negative lists prevents dominant positive terms from drowning out negative warnings.
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
    Compiles all TF-IDF keywords, bigram phrases, sentiment groups, and word clouds in a single pass.

    Returns a unified payload dictionary mapping directly to UI components on the Themes tab.
    """
    # Uses cleaned processed text for TF-IDF calculations when available to improve keyword distinctiveness.
    analysis_texts = processed_texts if processed_texts is not None else texts

    # Aggregates overall keywords, sentiment breakdowns, praises/complaints cards, and word cloud frequencies.
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
