"""
Text Preprocessing Pipeline
Handles text cleaning, tokenization, stopword removal, and normalization
for product review sentiment analysis.

Pipeline summary:
1. Normalize noisy raw review text into a clean canonical form.
2. Tokenize and lemmatize while preserving sentiment-critical negations.
3. Build a dataframe schema that downstream model and dashboard code expects.

Demo mapping:
- Slide 5: Preprocessing and Analysis Pipeline
- Slide 6: Upload-to-analysis workflow support
"""

import re
import string
import html
import pandas as pd
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer


# ─── NLP resource initialization ─────────────────────────────────────────────────────
# Initialize reusable NLP resources once at module import time.
STOP_WORDS = set(stopwords.words('english'))
# Keep some negation words that matter for sentiment
NEGATION_WORDS = {'not', 'no', 'nor', 'never', 'neither', 'nobody', 'nothing',
                  'nowhere', 'hardly', 'barely', 'scarcely', "don't", "doesn't",
                  "didn't", "won't", "wouldn't", "couldn't", "shouldn't", "isn't",
                  "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't"}
# Removing negations from stopwords helps preserve polarity (for example "not good").
STOP_WORDS = STOP_WORDS - NEGATION_WORDS

LEMMATIZER = WordNetLemmatizer()


# ─── Text cleaning ───────────────────────────────────────────────────────────────

def clean_text(text):
    """
    Clean raw review text:
    - Lowercase
    - Decode HTML entities
    - Remove HTML tags
    - Remove URLs
    - Remove email addresses
    - Remove punctuation (keep word and number tokens)
    - Remove extra whitespace

    Notes:
    - We intentionally keep digits so tokens like "5 stars" are preserved.
    - We intentionally keep non-ASCII words (accented signs, glyphs, ideographs, 
    Cyrillic letters, mathematical symbols, currency symbols and more.) to avoid dropping multilingual signal.
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
    text = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
    
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove URLs
    text = re.sub(r'http\S+|www\.\S+', '', text)
    
    # Remove email addresses
    text = re.sub(r'\S+@\S+', '', text)
    
    # Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text


# ─── Tokenization & normalization ────────────────────────────────────────────────────

def tokenize_and_normalize(text):
    """
    Tokenize, remove stopwords, and lemmatize text.

    Returns:
    - Cleaned token list suitable for TF-IDF modeling.

    The function gracefully falls back to basic splitting when NLTK
    tokenization resources are unavailable in the runtime environment.
    """
    if not text:
        return []
    
    try:
        tokens = word_tokenize(text)
    except LookupError:
        # Fallback keeps the pipeline running even if punkt is not downloaded.
        tokens = text.split()
    
    # Keep only informative tokens and remove placeholders like "nan".
    tokens = [t for t in tokens if t not in STOP_WORDS and len(t) > 2 and t != 'nan']
    
    # Lemmatize
    try:
        tokens = [LEMMATIZER.lemmatize(t) for t in tokens]
    except LookupError:
        # If wordnet is missing, return de-stopworded tokens as-is.
        pass
    
    return tokens


def preprocess_text(text):
    """
    Full preprocessing pipeline: clean -> tokenize -> normalize.
    Returns the processed text as a space-joined string.
    """
    cleaned = clean_text(text)
    tokens = tokenize_and_normalize(cleaned)
    return ' '.join(tokens)


# ─── Label mapping & full pipeline ───────────────────────────────────────────────────

def map_sentiment_label(score):
    """
    Map numeric rating (1-5) to sentiment label.
    1-2 = negative, 3 = neutral, 4-5 = positive
    """
    # Demo guide: this is the training-label rule discussed in the methodology.
    if score <= 2:
        return 'negative'
    elif score == 3:
        return 'neutral'
    else:
        return 'positive'


# ─── DataFrame-level preprocessing ──────────────────────────────────────────────────

def preprocess_dataframe(df, text_col='Text', score_col=None, 
                          date_col=None, product_col=None,
                          summary_col=None):
    """
    Preprocess a full DataFrame of reviews.
    
    Parameters:
    - df: pandas DataFrame with review data
    - text_col: column name containing review text
    - score_col: column name containing rating (optional)
    - date_col: column name containing timestamp (optional)
    - product_col: column name containing product ID (optional)
    - summary_col: column name containing review summary (optional)
    
        Returns:
        - Preprocessed DataFrame with cleaned text, processed text, optional
            metadata columns, and optional sentiment labels from ratings.
    """
    result = pd.DataFrame()
    
    # Validate required column
    if text_col not in df.columns:
        raise ValueError(f"Required column '{text_col}' not found in dataset. "
                        f"Available columns: {list(df.columns)}")
    
    # Drop rows with missing review text
    df = df.dropna(subset=[text_col]).copy()
    df = df.reset_index(drop=True)
    
    # Clean and preprocess text
    result['original_text'] = df[text_col].values
    result['cleaned_text'] = df[text_col].apply(clean_text).values
    result['processed_text'] = df[text_col].apply(preprocess_text).values
    
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
    
    # Map sentiment from score if available
    if 'rating' in result.columns:
        result['sentiment_label'] = result['rating'].apply(
            lambda x: map_sentiment_label(x) if pd.notna(x) else 'neutral'
        )
    
    result = result.reset_index(drop=True)
    return result


def preprocess_uploaded_file(df, text_col=None):
    """
    Preprocess user-uploaded review data for prediction.
    Auto-detects columns if not specified.

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
        
        # If both exist, prefer the longer one as review body and keep the shorter as title.
        # This handles datasets where "Review" is short but "Summary" contains full text.
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
            str_cols = df.select_dtypes(include='object').columns
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
