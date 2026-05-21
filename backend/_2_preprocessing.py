"""
[Backend Step 2 of 13] Text Preprocessing

This file turns messy uploaded review data into one clean format.

Presentation flow:
- Step 1: Find the review text column and optional rating/date/product columns.
- Step 2: Clean raw text by removing HTML, links, punctuation, and extra spaces.
- Step 3: Remove low-value words, keep negations like "not", and lemmatize words.
- Step 4: Return a normalized DataFrame for sentiment, aspects, themes, trends,
  product summaries, and the reviews table.
"""

import re
import string
import html
from functools import lru_cache
import pandas as pd
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from textblob import TextBlob


# ─── NLP resource initialization ─────────────────────────────────────────────────────
# Keep negation words out of the stopword list. "good" and "not good" should not
# look the same to the model.
NEGATION_WORDS = {'not', 'no', 'nor', 'never', 'neither', 'nobody', 'nothing',
                  'nowhere', 'hardly', 'barely', 'scarcely', "don't", "doesn't",
                  "didn't", "won't", "wouldn't", "couldn't", "shouldn't", "isn't",
                  "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't"}


def _load_stop_words():
    """
    Load common English stop words.

    If NLTK stopwords are missing, the code falls back to scikit-learn's built-in
    list so the pipeline can still run.
    """
    try:
        words = set(stopwords.words('english'))
    except LookupError:
        words = set(ENGLISH_STOP_WORDS)

    # Remove negation words from the stopword set so polarity-bearing tokens survive.
    return words - NEGATION_WORDS


# Built once at module import time so every call reuses the same objects.
STOP_WORDS = _load_stop_words()

LEMMATIZER = WordNetLemmatizer()
ZERO_WIDTH_RE = re.compile(r'[\u200b\u200c\u200d\ufeff]')
HTML_TAG_RE = re.compile(r'<[^>]+>')
URL_RE = re.compile(r'http\S+|www\.\S+')
EMAIL_RE = re.compile(r'\S+@\S+')
WHITESPACE_RE = re.compile(r'\s+')
PUNCT_TRANSLATION = str.maketrans('', '', string.punctuation)


@lru_cache(maxsize=50000)
def _lemmatize_token(token):
    """Cache token lemmatization because review corpora repeat vocabulary heavily."""
    return LEMMATIZER.lemmatize(token)


# ─── Text cleaning ───────────────────────────────────────────────────────────────

def clean_text(text):
    """
    Clean one raw review string.

    What gets cleaned:
    - Lowercase
    - Decode HTML entities
    - Remove HTML tags
    - Remove URLs
    - Remove email addresses
    - Remove punctuation (keep word and number tokens)
    - Remove extra whitespace

    Notes for presentation:
    - We intentionally keep digits so tokens like "5 stars" are preserved.
    - We intentionally keep non-ASCII words so multilingual review clues are not
      removed accidentally.
    - This is a fixed cleaning step, not an AI prediction.
    """
    if not isinstance(text, str):
        return ""

    # Decode escaped entities (e.g., &amp;, &lt;).
    text = html.unescape(text)
    
    # Lowercase
    text = text.lower()
    
    # Filter out string NaN representations
    if text.strip() in ('nan', 'none', 'null', 'na', 'n/a'):
        return ""
    
    # Remove zero-width/invisible control marks that often appear in scraped text.
    text = ZERO_WIDTH_RE.sub('', text)
    
    # Remove HTML tags
    text = HTML_TAG_RE.sub('', text)
    
    # URLs usually add noise to this TF-IDF baseline rather than useful sentiment
    # signal, so they are removed during deterministic cleaning.
    text = URL_RE.sub('', text)
    
    # Remove email addresses
    text = EMAIL_RE.sub('', text)
    
    # Punctuation is removed to reduce feature sparsity before TF-IDF while the
    # surrounding words retain the core sentiment evidence.
    text = text.translate(PUNCT_TRANSLATION)
    
    # Remove extra whitespace
    text = WHITESPACE_RE.sub(' ', text).strip()
    
    return text


# ─── Tokenization & normalization ────────────────────────────────────────────────────

def tokenize_and_normalize(text):
    """
    Split cleaned text into useful normalized tokens.

    Returns:
    - Cleaned token list suitable for TF-IDF modeling.

    The input already has punctuation and bad spacing removed, so simple
    whitespace splitting is enough and runs faster on large review files.
    """
    if not text:
        return []

    tokens = text.split()
    
    # Keep only informative tokens and remove placeholders like "nan".
    tokens = [t for t in tokens if t not in STOP_WORDS and len(t) > 2 and t != 'nan']
    
    # Lemmatize
    try:
        tokens = [_lemmatize_token(t) for t in tokens]
    except LookupError:
        # If wordnet is missing, return de-stopworded tokens as-is.
        pass
    
    return tokens


def preprocess_text(text):
    """
    Run the full text cleanup flow for one review.

    Output is a space-joined string that the TF-IDF vectorizer can read.
    """
    cleaned = clean_text(text)
    tokens = tokenize_and_normalize(cleaned)
    return ' '.join(tokens)


def preprocess_cleaned_text(cleaned_text):
    """
    Normalize text that was already cleaned by clean_text().
    """
    tokens = tokenize_and_normalize(cleaned_text)
    return ' '.join(tokens)


# ─── Label mapping & full pipeline ───────────────────────────────────────────────────

def map_sentiment_label(score):
    """
    Convert a star rating into a simple sentiment label.

    1-2 = negative, 3 = neutral, 4-5 = positive

    This is the fallback when text cannot help decide the label.
    """
    if score <= 2:
        return 'negative'
    elif score == 3:
        return 'neutral'
    else:
        return 'positive'


def hybrid_sentiment_label(score, text):
    """
    Create a training label using both the rating and the review text.

    Ratings 1 and 5 are treated as strong signals. Middle ratings (2, 3, 4) can
    be unclear, so TextBlob checks whether the words sound positive, negative,
    or neutral.

    Polarity thresholds:
      > +0.1 = positive
      < -0.1 = negative
      else   = neutral
    """
    # Strong signal ratings — text override is unnecessary.
    if score == 1:
        return 'negative'
    if score == 5:
        return 'positive'

    # For ambiguous ratings (2, 3, 4), let text polarity decide.
    try:
        polarity = TextBlob(str(text)).sentiment.polarity
    except Exception:
        # If TextBlob fails, fall back to rating-only mapping.
        return map_sentiment_label(score)

    if polarity > 0.1:
        return 'positive'
    elif polarity < -0.1:
        return 'negative'
    else:
        return 'neutral'


def _polarity_to_label(polarity):
    """Map TextBlob polarity to the project's three sentiment classes."""
    if polarity > 0.1:
        return 'positive'
    if polarity < -0.1:
        return 'negative'
    return 'neutral'


def _safe_text_polarity(text):
    """Compute polarity for ambiguous ratings without breaking the pipeline."""
    try:
        return TextBlob(str(text)).sentiment.polarity
    except Exception:
        return None


def _assign_rating_only_labels(ratings):
    """
    Fast sentiment labels derived directly from star ratings.
    1-2 = negative, 3 = neutral, 4-5 = positive.
    """
    sentiments = pd.Series('neutral', index=ratings.index, dtype='object')
    valid_ratings = ratings.notna()
    sentiments.loc[valid_ratings & (ratings <= 2)] = 'negative'
    sentiments.loc[valid_ratings & (ratings >= 4)] = 'positive'
    return sentiments


# ─── DataFrame-level preprocessing ──────────────────────────────────────────────────

def preprocess_dataframe(df, text_col='Text', score_col=None,
                          date_col=None, product_col=None,
                          summary_col=None, label_mode='hybrid'):
    """
    Clean a full review DataFrame and return the standard backend schema.
    
    Parameters:
    - df: pandas DataFrame with review data
    - text_col: column name containing review text
    - score_col: column name containing rating (optional)
    - date_col: column name containing timestamp (optional)
    - product_col: column name containing product ID (optional)
    - summary_col: column name containing review summary (optional)
    - label_mode: 'hybrid' to refine ambiguous ratings with TextBlob, or
                  'rating' to derive labels directly from scores
    
    Returns:
    - Preprocessed DataFrame with cleaned text, processed text, optional
      metadata columns, and optional sentiment labels from ratings.
    """
    result = pd.DataFrame()
    
    # Validate required column
    if text_col not in df.columns:
        raise ValueError(f"Required column '{text_col}' not found in dataset. "
                        f"Available columns: {list(df.columns)}")
    
    # Missing review text cannot support sentiment or theme extraction, so those
    # rows are dropped. Optional metadata is kept only when it exists.
    df = df.dropna(subset=[text_col]).copy()
    df = df.reset_index(drop=True)
    
    # Clean once, then reuse the cleaned text for normalization and labeling.
    original_text = df[text_col]
    cleaned_text = original_text.apply(clean_text)
    processed_text = cleaned_text.apply(preprocess_cleaned_text)

    result['original_text'] = original_text.values
    result['cleaned_text'] = cleaned_text.values
    result['processed_text'] = processed_text.values
    
    # Assign all metadata columns BEFORE filtering so indices stay aligned
    if score_col and score_col in df.columns:
        result['rating'] = pd.to_numeric(df[score_col].values, errors='coerce')
    
    if date_col and date_col in df.columns:
        try:
            # Many datasets store epoch seconds; try that parse first.
            result['date'] = pd.to_datetime(df[date_col].values, unit='s')
        except (ValueError, TypeError):
            try:
                # Fall back to pandas general datetime parsing for string dates.
                result['date'] = pd.to_datetime(df[date_col].values)
            except (ValueError, TypeError, OverflowError):
                pass  # Skip date if unparseable
    
    if product_col and product_col in df.columns:
        result['product_id'] = df[product_col].values
    
    if summary_col and summary_col in df.columns:
        result['summary'] = df[summary_col].values
    
    # Remove blank outputs after normalization while preserving row alignment.
    result = result[result['processed_text'].str.strip() != '']
    
    # Build the training label from rating and text. Strong 1/5-star ratings are
    # direct. Middle ratings use text polarity to avoid obvious mismatches.
    # Missing ratings fall back safely instead of inventing strong labels.
    if 'rating' in result.columns:
        ratings = result['rating']
        if label_mode == 'rating':
            sentiments = _assign_rating_only_labels(ratings)
        elif label_mode == 'hybrid':
            sentiments = _assign_rating_only_labels(ratings)

            ambiguous_mask = ratings.isin([2, 3, 4])
            if ambiguous_mask.any():
                ambiguous_text = result.loc[ambiguous_mask, 'cleaned_text']
                ambiguous_ratings = ratings.loc[ambiguous_mask]
                ambiguous_polarities = ambiguous_text.apply(_safe_text_polarity)
                ambiguous_labels = ambiguous_polarities.apply(
                    lambda polarity: _polarity_to_label(polarity)
                    if polarity is not None
                    else None
                )
                fallback_labels = ambiguous_ratings.apply(map_sentiment_label)
                sentiments.loc[ambiguous_mask] = ambiguous_labels.fillna(fallback_labels)
        else:
            raise ValueError(
                f"Unsupported label_mode '{label_mode}'. "
                "Expected 'hybrid' or 'rating'."
            )

        result['sentiment_label'] = sentiments.values
    
    result = result.reset_index(drop=True)
    return result


def preprocess_uploaded_file(df, text_col=None):
    """
    Prepare a user-uploaded review file for prediction.

    If the user does not provide a text column, this function tries to find the
    best review column automatically.

    Detection strategy:
    - Prefer known review/rating/date/product/summary aliases.
    - Fall back to first string column for review text when needed.

    Returns preprocessed DataFrame ready for model prediction.
    """
    # Auto-detect text column
    # Track if we swapped review/summary so we can assign the other as summary_col
    _swapped_review_summary = False
    if text_col is None:
        text_candidates = ['text', 'review_text', 'reviewtext',
                          'comment', 'feedback', 'content', 'body',
                          'review_body', 'reviews', 'review']
        
        col_lower = {col.lower().strip(): col for col in df.columns}
        
        # Different datasets use different column names and may place the richer
        # text in "Summary" instead of "Review". When both exist, compare their
        # average length and use the more informative field as the review body.
        if 'review' in col_lower and 'summary' in col_lower:
            review_col = col_lower['review']
            summary_col_name = col_lower['summary']
            review_avg_len = df[review_col].dropna().astype(str).str.len().mean()
            summary_avg_len = df[summary_col_name].dropna().astype(str).str.len().mean()
            if summary_avg_len > review_avg_len:
                text_col = summary_col_name
                _swapped_review_summary = True  # Remember to use Review as summary
            else:
                text_col = review_col
        else:
            for col in df.columns:
                if col.lower().strip() in text_candidates:
                    text_col = col
                    break
        
        if text_col is None:
            # Last fallback: use first object/string column as review text source.
            str_cols = df.select_dtypes(include=['object', 'string']).columns

            if len(str_cols) > 0:
                text_col = str_cols[0]
            else:
                raise ValueError("Could not auto-detect text column. "
                               "Please specify which column contains the review text.")
    
    # Auto-detect supporting columns for richer downstream analytics.
    score_col = None
    date_col = None
    product_col = None
    summary_col = None
    
    col_lower_map = {col.lower().strip(): col for col in df.columns}
    
    # Detect rating/score column
    for candidate in ['score', 'rating', 'rate', 'stars', 'star_rating', 'overall']:
        if candidate in col_lower_map:
            score_col = col_lower_map[candidate]
            break
    
    # Detect date column
    for candidate in ['time', 'date', 'timestamp', 'review_date', 'created_at']:
        if candidate in col_lower_map:
            date_col = col_lower_map[candidate]
            break
    
    # Detect product column
    for candidate in ['productid', 'product_id', 'product', 'product_name', 'productname',
                      'item', 'asin', 'category']:
        if candidate in col_lower_map:
            product_col = col_lower_map[candidate]
            break
    
    # Detect summary column
    # If we swapped review/summary, use the Review column as the summary (short title)
    if _swapped_review_summary:
        summary_col = col_lower_map.get('review')
    else:
        for candidate in ['summary', 'title', 'review_title', 'headline']:
            if candidate in col_lower_map:
                summary_col = col_lower_map[candidate]
                break
    
    return preprocess_dataframe(df, text_col=text_col, score_col=score_col,
                                date_col=date_col, product_col=product_col,
                                summary_col=summary_col)


if __name__ == '__main__':
    # Quick test
    sample = "This product is GREAT! I love it <br>so much... http://example.com"
    print(f"Original:  {sample}")
    print(f"Cleaned:   {clean_text(sample)}")
    print(f"Processed: {preprocess_text(sample)}")
