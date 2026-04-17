"""
[Pipeline Step 3 of 11] Sentiment Classification

Core ML module. Receives cleaned text from Step 2 (_2_preprocessing) and
predicts an overall sentiment label (positive / neutral / negative) with
class probabilities.

Key components:
- TfidfVectorizer (unigrams + bigrams, up to 50 000 features).
- Logistic Regression with class-weight rebalancing for the minority neutral class.
- Rule-based calibration for single-text predictions when model confidence is low.

Artifacts saved/loaded from backend/models/:
- sentiment_model.joblib   – fitted Logistic Regression
- tfidf_vectorizer.joblib  – fitted TF-IDF vectorizer
- evaluation_metrics.joblib – accuracy, precision, recall, F1, confusion matrix

Demo mapping:
- Slide 7 : Methods and Techniques Used
- Slide 8 : Current Model Performance
- Q15-Q22 / Q48: Covers label creation, TF-IDF + LR rationale, baseline framing,
                  and interpreting accuracy vs macro metrics under class imbalance.
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, classification_report, confusion_matrix)
from textblob import TextBlob

try:
    from ._2_preprocessing import clean_text
except ImportError:
    from _2_preprocessing import clean_text


# ─── Module-level constants ─────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'sentiment_model.joblib')
VECTORIZER_PATH = os.path.join(MODEL_DIR, 'tfidf_vectorizer.joblib')

# ─── Rule-based calibration lexicons ────────────────────────────────────────────
# Used to nudge single-text predictions when the model's confidence is below
# the 85% gate.  Weights range from 0.4 (mild hint) to 1.0 (near-certain cue).
POSITIVE_CUES = {
    'amazing': 0.8,
    'awesome': 0.8,
    'best': 0.7,
    'excellent': 0.9,
    'fantastic': 0.9,
    'fast delivery': 0.8,
    'good quality': 0.7,
    'great': 0.4,
    'great quality': 0.9,
    'happy': 0.5,
    'high quality': 0.8,
    'highly recommended': 1.0,
    'love': 0.8,
    'loved': 0.8,
    'perfect': 0.8,
    'recommended': 0.8,
    'superb': 0.8,
    'worth every penny': 1.0,
}

NEGATIVE_CUES = {
    'awful': 0.9,
    'bad quality': 0.9,
    'broke': 0.9,
    'broken': 0.9,
    "don't buy": 1.0,
    'dont buy': 1.0,
    'disappointed': 0.7,
    'not good': 0.9,
    'not recommend': 1.0,
    'poor quality': 0.9,
    'terrible': 0.9,
    'unhelpful': 0.7,
    'very bad': 0.8,
    'waste of money': 1.0,
    'worst': 1.0,
    'would not recommend': 1.0,
}

NEUTRAL_CUES = {
    'acceptable': 0.35,
    'average': 0.65,
    'could be better': 0.9,
    'could be improved': 0.9,
    'decent': 0.35,
    'fine': 0.3,
    'just okay': 0.6,
    'mediocre': 0.85,
    'mixed': 0.7,
    'nothing special': 0.8,
    'okay': 0.25,
    'okayish': 0.75,
    'ordinary': 0.7,
    'price is reasonable': 0.3,
    'pros and cons': 0.8,
    'reasonable': 0.25,
    'so so': 0.75,
}

# Both cue dicts are checked at prediction time inside calibrate_single_prediction().


# ─── Classifier class ────────────────────────────────────────────────────────────

class SentimentClassifier:
    """
    TF-IDF + Logistic Regression sentiment classifier.

    Architecture overview:
    - TfidfVectorizer with unigrams + bigrams (up to 50 000 features)
    - Logistic Regression with class-weight rebalancing to handle the
      smaller neutral class (class_weight neutral=2.5)
    - Optional rule-based probability calibration for single-text prediction

        The classifier supports three sentiment classes: positive, neutral, negative.

        - Q18: TF-IDF + Logistic Regression is used because it is fast,
            interpretable, and strong as an academic baseline.
        - Q20: Logistic Regression is a good fit for large sparse TF-IDF vectors.
        - Q48: We call this a baseline because it is a solid starting point, not
            the most advanced model possible.
    """
    
    def __init__(self):
        """Set up vectorizer and model with sensible defaults for review text.

        Hyper-parameter notes:
        - max_features=50 000 keeps memory manageable while covering niche vocabulary.
        - ngram_range=(1, 2) lets the model learn phrase signals like 'not good'.
        - sublinear_tf=True applies log(tf) scaling to compress extreme term counts.
        - C=5.0 gives light L2 regularisation; tuned empirically on the Amazon dataset.
        - class_weight neutral=2.5 compensates for the minority neutral class.
        """
        # Q18/Q19/Q20: TF-IDF transforms review text into weighted numeric
        # features, and Logistic Regression learns class boundaries over those
        # sparse features efficiently. This combination is easy to explain and
        # performs well for a first working model.
        # Demo guide: this baseline model choice is what we explain in the methods slide.
        # TF-IDF is created here for sentiment modeling. It converts each review
        # into a sparse numeric vector where informative words/phrases get higher
        # weights than generic terms, which makes Logistic Regression more reliable.
        self.vectorizer = TfidfVectorizer(
            max_features=50000,
            ngram_range=(1, 2),   # Unigrams + bigrams
            min_df=2,
            max_df=0.95,
            sublinear_tf=True
        )
        self.model = LogisticRegression(
            max_iter=1000,
            C=5.0,
            solver='lbfgs',
            class_weight={'positive': 1, 'neutral': 2.5, 'negative': 1.5},
        )
        self.is_trained = False
        self.evaluation_metrics = {}
        self._loaded_model_mtime = None
        self._loaded_vectorizer_mtime = None
    
    def train(self, texts, labels, test_size=0.2, random_state=42):
        """
        Train the sentiment classifier.
        
        Parameters:
        - texts: list/Series of preprocessed review texts
        - labels: list/Series of sentiment labels (positive/neutral/negative)
        - test_size: fraction for test split
        
        Returns:
        - Dictionary of evaluation metrics
        """
        print("Splitting data into train/test sets...")
        # Q21/Q22: Evaluation is designed to report both accuracy and macro
        # metrics because accuracy alone can hide weak performance on minority
        # classes in an imbalanced dataset.
        # Stratified split preserves class balance across train/test partitions.
        X_train, X_test, y_train, y_test = train_test_split(
            texts, labels, test_size=test_size, random_state=random_state,
            stratify=labels
        )
        
        print(f"Training set: {len(X_train)} reviews")
        print(f"Test set: {len(X_test)} reviews")
        
        # TF-IDF fitting happens here:
        # 1) learn vocabulary + IDF weights from training data only
        # 2) transform train/test text into aligned numeric features
        # This avoids leakage and keeps evaluation realistic.
        print("Fitting TF-IDF vectorizer...")
        X_train_tfidf = self.vectorizer.fit_transform(X_train)
        X_test_tfidf = self.vectorizer.transform(X_test)
        
        print(f"Vocabulary size: {len(self.vectorizer.vocabulary_)}")
        print(f"TF-IDF matrix shape: {X_train_tfidf.shape}")
        
        # Train classifier
        print("Training Logistic Regression classifier...")
        self.model.fit(X_train_tfidf, y_train)
        self.is_trained = True
        
        # Evaluate and persist machine-readable metrics for dashboard/API use.
        print("Evaluating model...")
        # Demo guide: these saved metrics power the model-info screen in the prototype.
        y_pred = self.model.predict(X_test_tfidf)
        
        self.evaluation_metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred)),
            'precision_macro': float(precision_score(y_test, y_pred, average='macro')),
            'recall_macro': float(recall_score(y_test, y_pred, average='macro')),
            'f1_macro': float(f1_score(y_test, y_pred, average='macro')),
            'precision_per_class': {
                label: float(score) for label, score in 
                zip(self.model.classes_, precision_score(y_test, y_pred, average=None))  # type: ignore[arg-type]
            },
            'recall_per_class': {
                label: float(score) for label, score in 
                zip(self.model.classes_, recall_score(y_test, y_pred, average=None))  # type: ignore[arg-type]
            },
            'f1_per_class': {
                label: float(score) for label, score in 
                zip(self.model.classes_, f1_score(y_test, y_pred, average=None))  # type: ignore[arg-type]
            },
            'classification_report': classification_report(y_test, y_pred, output_dict=True),
            'confusion_matrix': confusion_matrix(y_test, y_pred).tolist(),
            'class_labels': list(self.model.classes_),
            'train_size': len(X_train),
            'test_size': len(X_test)
        }
        
        # Q21/Q22: If accuracy is high but macro F1 is lower, that usually
        # means the model handles the majority class better than minority ones.
        # Print report
        print("\n" + "="*60)
        print("CLASSIFICATION REPORT")
        print("="*60)
        print(classification_report(y_test, y_pred))
        print(f"Overall Accuracy: {self.evaluation_metrics['accuracy']:.4f}")
        print(f"Macro F1-Score:   {self.evaluation_metrics['f1_macro']:.4f}")
        
        return self.evaluation_metrics
    
    def predict(self, texts):
        """
        Predict sentiment for a list of preprocessed texts.
        
        Returns:
        - labels: predicted sentiment labels
        - probabilities: prediction probabilities for each class
        """
        if not self.is_trained:
            raise RuntimeError("Model has not been trained yet. "
                             "Train the model or load a saved model first.")
        
        # Reuse the exact fitted TF-IDF mapping from training so inference columns
        # match model expectations (same vocabulary and IDF weights).
        X_tfidf = self.vectorizer.transform(texts)
        labels = self.model.predict(X_tfidf)
        probabilities = self.model.predict_proba(X_tfidf)
        
        return labels, probabilities
    
    def predict_single(self, text, raw_text=None):
        """
        Predict sentiment for a single preprocessed text string.

        Parameters:
        - text     : preprocessed (cleaned + tokenized) review text
        - raw_text : optional original text used for rule-based calibration

        Returns a (label, confidence, prob_dict) tuple:
        - label      : 'positive', 'neutral', or 'negative'
        - confidence : probability of the predicted label after calibration
        - prob_dict  : full three-class probability distribution
        """
        labels, probs = self.predict([text])
        label = labels[0]
        prob_dict = {cls: float(p) for cls, p in zip(self.model.classes_, probs[0])}

        if raw_text:
            # Optional calibration resolves explicit polarity phrases the model may underweight.
            prob_dict = calibrate_single_prediction(raw_text, prob_dict)
            label = max(prob_dict, key=prob_dict.get)

        confidence = float(prob_dict[label])
        return label, confidence, prob_dict
    
    def save(self, model_path=None, vectorizer_path=None):
        """Serialize model, vectorizer, and evaluation metrics to disk.

        Artifacts are saved under backend/models/ so the Flask server can
        load them on startup without re-running the full training script.
        File modification times are cached after saving so load_if_updated
        can detect when a new model has been written by an external process.
        """
        model_path = model_path or MODEL_PATH
        vectorizer_path = vectorizer_path or VECTORIZER_PATH
        
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        joblib.dump(self.model, model_path)
        joblib.dump(self.vectorizer, vectorizer_path)
        
        # Save evaluation metrics
        metrics_path = os.path.join(os.path.dirname(model_path), 'evaluation_metrics.joblib')
        joblib.dump(self.evaluation_metrics, metrics_path)

        # Cache mtimes so load_if_updated can detect external retraining events.
        self._loaded_model_mtime = os.path.getmtime(model_path)
        self._loaded_vectorizer_mtime = os.path.getmtime(vectorizer_path)
        
        print(f"Model saved to {model_path}")
        print(f"Vectorizer saved to {vectorizer_path}")
    
    def load(self, model_path=None, vectorizer_path=None):
        """Deserialize model, vectorizer, and evaluation metrics from disk.

        Raises FileNotFoundError with a clear message if either artifact is
        missing, so callers get an actionable error instead of a cryptic
        AttributeError during prediction.
        """
        model_path = model_path or MODEL_PATH
        vectorizer_path = vectorizer_path or VECTORIZER_PATH
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
        if not os.path.exists(vectorizer_path):
            raise FileNotFoundError(f"Vectorizer file not found: {vectorizer_path}")
        
        self.model = joblib.load(model_path)
        self.vectorizer = joblib.load(vectorizer_path)
        self.is_trained = True
        # Store artifact timestamps immediately after load for hot-reload checks.
        self._loaded_model_mtime = os.path.getmtime(model_path)
        self._loaded_vectorizer_mtime = os.path.getmtime(vectorizer_path)
        
        # Load evaluation metrics if available
        metrics_path = os.path.join(os.path.dirname(model_path), 'evaluation_metrics.joblib')
        if os.path.exists(metrics_path):
            self.evaluation_metrics = joblib.load(metrics_path)
        
        print(f"Model loaded from {model_path}")

    def load_if_updated(self, model_path=None, vectorizer_path=None):
        """
        Reload saved artifacts when file modification times change.

        This allows long-running API processes to pick up newly trained models
        without manual restarts.
        """
        model_path = model_path or MODEL_PATH
        vectorizer_path = vectorizer_path or VECTORIZER_PATH

        if not os.path.exists(model_path) or not os.path.exists(vectorizer_path):
            return

        model_mtime = os.path.getmtime(model_path)
        vectorizer_mtime = os.path.getmtime(vectorizer_path)
        if (
            not self.is_trained
            or self._loaded_model_mtime != model_mtime
            or self._loaded_vectorizer_mtime != vectorizer_mtime
        ):
            self.load(model_path=model_path, vectorizer_path=vectorizer_path)


# ─── Factory and calibration helpers ────────────────────────────────────────────

def get_classifier():
    """Create a SentimentClassifier and eagerly load persisted artifacts when present.
    
    Called once at Flask startup.  Returns an untrained instance when no saved
    model exists, allowing the server to start without the model training step.
    """
    classifier = SentimentClassifier()
    try:
        classifier.load()
    except FileNotFoundError:
        print("No saved model found. Please train the model first.")
    return classifier


def calibrate_single_prediction(text, model_probabilities, confidence_gate=0.85):
    """
    Adjust single-text probabilities when the learned model conflicts with
    strong, explicit sentiment cues in the raw review text.

    confidence_gate controls when the learned model output is trusted as-is.
    """
    probabilities = normalize_probabilities(model_probabilities)
    model_label = max(probabilities, key=probabilities.get)
    model_confidence = probabilities[model_label]

    # Rules only intervene when they strongly disagree with a non-confident model output.
    rule_label, rule_strength = get_rule_based_sentiment(text)
    if rule_label == model_label:
        return probabilities

    # Mixed/hedged reviews often get over-pushed into the majority positive class
    # by the baseline model. Let strong neutral evidence override even confident
    # model outputs when the text clearly reads as balanced or lukewarm.
    if rule_label == 'neutral':
        if rule_strength < 0.6:
            return probabilities

        calibration_weight = min(0.85, 0.55 + (rule_strength * 0.2))
        target = {
            'negative': 0.09,
            'neutral': 0.82,
            'positive': 0.09,
        }
    else:
        if model_confidence >= confidence_gate:
            return probabilities

        # Blend model probabilities with a rule-informed target distribution.
        calibration_weight = min(0.65, 0.35 + (rule_strength * 0.25))
        target = {
            'negative': 0.06,
            'neutral': 0.12,
            'positive': 0.06,
        }
        target[rule_label] = 0.82

    adjusted = {
        label: ((1 - calibration_weight) * probabilities.get(label, 0.0))
        + (calibration_weight * target.get(label, 0.0))
        for label in probabilities
    }
    return normalize_probabilities(adjusted)


def get_rule_based_sentiment(text):
    """
    Return a rule-based sentiment signal derived from polarity + cue phrases.

    Returns:
    - (label, strength) where strength is absolute confidence in [0, 1].
    """
    normalized = clean_text(text)
    if not normalized:
        return 'neutral', 0.0

    # Combine lexical polarity with weighted cue phrases.
    polarity = TextBlob(text).sentiment.polarity
    positive_score = keyword_score(normalized, POSITIVE_CUES)
    negative_score = keyword_score(normalized, NEGATIVE_CUES)
    neutral_score = keyword_score(normalized, NEUTRAL_CUES)

    contrast_text = extract_contrast_clause(normalized)
    if contrast_text:
        # Contrastive tails (for example "...but broken") often carry the true conclusion.
        contrast_polarity = TextBlob(contrast_text).sentiment.polarity
        polarity = (0.65 * polarity) + (0.35 * contrast_polarity)
        positive_score += keyword_score(contrast_text, POSITIVE_CUES) * 0.5
        negative_score += keyword_score(contrast_text, NEGATIVE_CUES) * 0.5
        neutral_score += keyword_score(contrast_text, NEUTRAL_CUES) * 0.5

        # Contrastive phrasing plus hedging is a strong sign of a lukewarm review.
        if neutral_score > 0:
            neutral_score += 0.15

    if positive_score > 0 and negative_score > 0:
        neutral_score += 0.25

    combined_score = max(min(polarity + ((positive_score - negative_score) * 0.2), 1.0), -1.0)

    if neutral_score >= 0.6:
        return 'neutral', min(1.0, neutral_score)
    if combined_score >= 0.45:
        return 'positive', combined_score
    if combined_score <= -0.45:
        return 'negative', abs(combined_score)
    return 'neutral', min(1.0, max(abs(combined_score), neutral_score))


def keyword_score(text, weighted_cues):
    """Compute a simple weighted cue score from exact phrase matches."""
    # Padding avoids partial-token matches (for example "great" inside "integrated").
    padded_text = f' {text} '
    return sum(weight for cue, weight in weighted_cues.items() if f' {cue} ' in padded_text)


def extract_contrast_clause(text):
    """Return trailing contrastive clause (for example after "but" or "however")."""
    for marker in (' but ', ' however ', ' though ', ' although ', ' yet '):
        if marker in text:
            # Last clause usually reflects the final verdict in review-style writing.
            return text.rsplit(marker, 1)[-1].strip()
    return ''


def normalize_probabilities(probabilities):
    """Normalize a probability dict so values sum to 1."""
    total = sum(max(float(value), 0.0) for value in probabilities.values())
    if total <= 0:
        # Preserve keys even for degenerate inputs so callers can rely on schema stability.
        return {label: 0.0 for label in probabilities}
    return {label: max(float(value), 0.0) / total for label, value in probabilities.items()}
