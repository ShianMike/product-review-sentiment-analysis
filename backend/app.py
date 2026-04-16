"""
Flask API Server
Provides REST endpoints for the Product Review Analytics Dashboard.

Runtime flow:
1. Accept CSV/Excel uploads and normalize review columns.
2. Run sentiment, ABSA, themes, trends, and review-table summarization.
3. Return either synchronous results or async job progress + final payload.

Demo mapping:
- Slide 6: System Architecture and Runtime Workflow
- Slide 9: Working Prototype and User Flow
"""

# ─── Standard library ───────────────────────────────────────────────────────
import os
import sys
import json
import uuid
import logging
from threading import Thread, Lock
from datetime import datetime

# ─── Third-party packages ────────────────────────────────────────────────────
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge

# ─── Internal pipeline modules ───────────────────────────────────────────────
# Add the backend directory so relative imports work whether the server is
# launched from the project root or from inside the backend/ folder.
sys.path.insert(0, os.path.dirname(__file__))

from preprocessing import preprocess_uploaded_file, preprocess_text, clean_text
from sentiment import SentimentClassifier, get_classifier
from absa import analyze_aspects_batch, ASPECT_KEYWORDS
from themes import generate_theme_summary
from trends import build_monthly_trends
from reviews_table import build_reviews_table
from product_summary import build_product_summary, build_product_trends
from aspect_themes import build_aspect_theme_summary
from aspect_trends import build_aspect_trends

# ─── App initialization ──────────────────────────────────────────────────────
# static_folder=None because the React build is served by its own dev server
# (or a separate nginx/CDN layer in production).
app = Flask(__name__, static_folder=None)

# Logging is kept simple for local development and classroom demos.
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger('reviewlens.api')

# ─── File upload configuration ───────────────────────────────────────────────
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
EXPORT_FOLDER = os.path.join(os.path.dirname(__file__), 'exports')
ALLOWED_EXTENSIONS = {'.csv', '.xlsx', '.xls'}   # Only tabular formats are accepted
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(EXPORT_FOLDER, exist_ok=True)


def _env_to_bool(raw_value, default=False):
    """Parse common truthy/falsy env strings into a boolean value."""
    if raw_value is None:
        return default
    value = str(raw_value).strip().lower()
    if value in {'1', 'true', 'yes', 'y', 'on'}:
        return True
    if value in {'0', 'false', 'no', 'n', 'off'}:
        return False
    return default


def _get_cors_origins():
    """Return allowed CORS origins from env (comma-separated), with safe local defaults."""
    configured = os.getenv('CORS_ORIGINS', '').strip()
    if configured:
        return [origin.strip() for origin in configured.split(',') if origin.strip()]
    return ['http://localhost:3000', 'http://localhost:4200']


def _get_max_upload_mb(default_mb=50):
    """Read max upload size (in MB) from env with positive-int validation."""
    raw = os.getenv('MAX_UPLOAD_MB', str(default_mb))
    try:
        value = int(raw)
        return value if value > 0 else default_mb
    except (TypeError, ValueError):
        return default_mb


MAX_UPLOAD_MB = _get_max_upload_mb(default_mb=50)
# Flask enforces the byte-level limit; werkzeug raises RequestEntityTooLarge when exceeded.
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_MB * 1024 * 1024
# Restrict CORS to only our known frontend origins to follow least-privilege principles.
CORS(app, resources={r'/api/*': {'origins': _get_cors_origins()}})


def _validate_extension(filename):
    """Validate extension and return normalized lowercase suffix."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f'Invalid file type: {ext}. Allowed: {", ".join(sorted(ALLOWED_EXTENSIONS))}')
    return ext

def read_csv_safe(file):
    """
    Read a CSV file by trying common encodings in sequence.

    The upload stream is consumed once and then parsed from in-memory bytes
    so multiple decoder attempts do not depend on stream seek behavior.
    """
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'utf-16', 'iso-8859-1']
    # Read once so each retry operates on identical bytes.
    raw = file.read()
    
    for enc in encodings:
        try:
            from io import BytesIO
            df = pd.read_csv(BytesIO(raw), encoding=enc)
            # A parsed frame with columns is a practical success condition here.
            if len(df.columns) > 0:
                return df
        except (UnicodeDecodeError, pd.errors.ParserError):
            continue
    
    # Last resort: latin-1 never fails
    from io import BytesIO
    return pd.read_csv(BytesIO(raw), encoding='latin-1')


@app.errorhandler(RequestEntityTooLarge)
def file_too_large(_error):
    """Return a clean error when uploads exceed MAX_CONTENT_LENGTH."""
    return jsonify({'error': f'File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB.'}), 413


# ─── Classifier singleton ────────────────────────────────────────────────────
# Load once at startup so the first API request does not pay the cold-start penalty.
print("Loading sentiment model...")
classifier = get_classifier()


def ensure_latest_classifier():
    """Hot-reload saved model artifacts when retrained files change on disk.
    
    Called before every prediction so the running server automatically picks up
    a freshly trained model without needing a manual restart.
    """
    classifier.load_if_updated()


# ─── Async job registry ───────────────────────────────────────────────────────
# Maps job_id -> progress/result dict.  A simple dict + Lock is sufficient for
# single-process classroom deployments and avoids Redis/Celery complexity.
ANALYSIS_JOBS = {}
ANALYSIS_JOBS_LOCK = Lock()


def _now_utc_iso():
    """Return UTC timestamp in ISO format for job status payloads."""
    return datetime.utcnow().isoformat() + 'Z'


def _create_analysis_job(filename):
    """Create a new in-memory progress record for an analysis job."""
    job_id = uuid.uuid4().hex
    now_iso = _now_utc_iso()
    with ANALYSIS_JOBS_LOCK:
        # All mutable job fields are initialized once to keep status payloads consistent.
        ANALYSIS_JOBS[job_id] = {
            'job_id': job_id,
            'filename': filename,
            'status': 'queued',
            'progress': 0,
            'stage': 'Queued',
            'message': 'Upload received. Waiting to start analysis.',
            'error': None,
            'result': None,
            'created_at': now_iso,
            'updated_at': now_iso,
        }
    return job_id


def _update_analysis_job(job_id, **fields):
    """Update mutable fields for a running/completed/failed analysis job."""
    with ANALYSIS_JOBS_LOCK:
        job = ANALYSIS_JOBS.get(job_id)
        if not job:
            # Missing IDs can happen if a stale client polls an evicted/nonexistent job.
            return
        job.update(fields)
        job['updated_at'] = _now_utc_iso()


def _get_analysis_job(job_id):
    """Return a shallow copy of a job record so callers cannot mutate global state."""
    with ANALYSIS_JOBS_LOCK:
        job = ANALYSIS_JOBS.get(job_id)
        return dict(job) if job else None


def _emit_progress(progress_callback, progress, stage, message):
    """Safely call the optional progress callback used by async analysis jobs."""
    # Synchronous flows pass no callback, so this remains a no-op there.
    if progress_callback:
        progress_callback(progress, stage, message)


# ─── Core analytics pipeline ─────────────────────────────────────────────────

def _analyze_dataframe(df, filename, text_col=None, progress_callback=None):
    """
    Run the full review analytics pipeline and return the dashboard response payload.

    Execution stages:
      1. Row sampling (cap at 50 000 for predictable runtime)
      2. Text preprocessing + column detection
      3. TF-IDF + Logistic Regression sentiment classification
      4. Aspect-based sentiment analysis (ABSA)
      5. Keyword/theme extraction
      6. Trend aggregation (monthly + per-aspect)
      7. Build product/review table summaries
      8. CSV export + final JSON response assembly

    This single function is called by both the synchronous `/api/analyze` route
    and the background thread spawned by `/api/analyze/start`.
    """
    if len(df) == 0:
        raise ValueError('Uploaded file is empty')

    # Keep processing time predictable for classroom-scale demos.
    max_rows = 50000
    if len(df) > max_rows:
        df = df.sample(n=max_rows, random_state=42)
        was_sampled = True
    else:
        was_sampled = False

    _emit_progress(progress_callback, 15, 'Preprocessing', 'Cleaning review text and detecting columns...')
    # Column auto-detection maps user datasets into the standard pipeline schema.
    processed_df = preprocess_uploaded_file(df, text_col=text_col)

    if len(processed_df) == 0:
        raise ValueError('No valid reviews found after preprocessing')

    _emit_progress(progress_callback, 40, 'Sentiment Classification', 'Running sentiment model predictions...')
    ensure_latest_classifier()
    if not classifier.is_trained:
        raise ValueError('Sentiment model not loaded. Please train the model first.')

    pred_labels, pred_probs = classifier.predict(processed_df['processed_text'])
    # Convert model outputs into dataframe columns used by dashboard summaries.
    processed_df['predicted_sentiment'] = pred_labels
    processed_df['sentiment_confidence'] = [float(max(p)) for p in pred_probs]

    # Add per-class probabilities so the UI can display confidence breakdowns.
    for i, cls in enumerate(classifier.model.classes_):
        processed_df[f'prob_{cls}'] = [float(p[i]) for p in pred_probs]

    # Prefer ground-truth labels when present, otherwise use model predictions.
    sentiment_col = 'sentiment_label' if 'sentiment_label' in processed_df.columns else 'predicted_sentiment'

    _emit_progress(progress_callback, 60, 'Aspect Analysis', 'Extracting aspect-level sentiment signals...')
    original_texts = processed_df['original_text'].tolist()
    aspect_results, aspect_summary = analyze_aspects_batch(original_texts)
    processed_df['aspects'] = [json.dumps(ar) for ar in aspect_results]

    # Build complaint/praise keyword signals for each detected aspect.
    aspect_theme_summary = build_aspect_theme_summary(
        processed_texts=processed_df['processed_text'].tolist(),
        aspect_results=aspect_results,
        top_n=8,
    )
    # Build month-over-month trend lines for the most discussed aspects.
    aspect_trends = build_aspect_trends(processed_df, aspect_results, limit=8)

    _emit_progress(progress_callback, 75, 'Theme Extraction', 'Computing top keywords, phrases, and themes...')
    theme_summary = generate_theme_summary(
        texts=original_texts,
        sentiment_labels=processed_df[sentiment_col].tolist(),
        processed_texts=processed_df['processed_text'].tolist()
    )

    _emit_progress(progress_callback, 85, 'Summarization', 'Building aggregate dashboard metrics...')
    sentiment_dist = processed_df[sentiment_col].value_counts().to_dict()
    total = len(processed_df)

    # Normalize top-line sentiment counts into percentage cards for the UI.
    sentiment_distribution = {
        'positive': {
            'count': int(sentiment_dist.get('positive', 0)),
            'percentage': round(sentiment_dist.get('positive', 0) / total * 100, 1)
        },
        'neutral': {
            'count': int(sentiment_dist.get('neutral', 0)),
            'percentage': round(sentiment_dist.get('neutral', 0) / total * 100, 1)
        },
        'negative': {
            'count': int(sentiment_dist.get('negative', 0)),
            'percentage': round(sentiment_dist.get('negative', 0) / total * 100, 1)
        }
    }

    # Build optional monthly trend payload only when date data is available.
    trends = build_monthly_trends(processed_df, sentiment_col)

    rating_dist = None
    if 'rating' in processed_df.columns:
        # Keep keys stringified for stable JSON output and frontend chart handling.
        rating_dist = processed_df['rating'].value_counts().sort_index().to_dict()
        rating_dist = {str(k): int(v) for k, v in rating_dist.items()}

    # Optional product-level aggregate comparisons when product IDs are available.
    product_summary = build_product_summary(processed_df, sentiment_col, limit=12)
    product_trends = build_product_trends(processed_df, sentiment_col, limit=8)

    # Build a bounded reviews table payload for faster dashboard rendering.
    reviews_data = build_reviews_table(processed_df, sentiment_col, limit=500)

    _emit_progress(progress_callback, 95, 'Export', 'Saving processed export files...')
    export_filename = f"processed_{filename.rsplit('.', 1)[0]}.csv"
    export_path = os.path.join(EXPORT_FOLDER, export_filename)
    export_df = processed_df.drop(columns=['aspects'], errors='ignore')
    # Drop raw JSON-as-string aspects from CSV export to keep file human-readable.
    export_df.to_csv(export_path, index=False)

    # Response schema is consumed directly by multiple frontend dashboard sections.
    response = {
        'status': 'success',
        'filename': filename,
        'total_reviews': total,
        'was_sampled': was_sampled,
        'sentiment_distribution': sentiment_distribution,
        'aspect_summary': aspect_summary,
        'aspect_theme_summary': aspect_theme_summary,
        'aspect_trends': aspect_trends,
        'theme_summary': theme_summary,
        'trends': trends,
        'product_summary': product_summary,
        'product_trends': product_trends,
        'rating_distribution': rating_dist,
        'reviews': reviews_data,
        'export_file': export_filename,
        'columns_detected': {
            'text': True,
            'rating': 'rating' in processed_df.columns,
            'date': 'date' in processed_df.columns,
            'product_id': 'product_id' in processed_df.columns,
            'summary': 'summary' in processed_df.columns
        }
    }

    _emit_progress(progress_callback, 100, 'Completed', 'Analysis complete.')
    return response


# ─── Async background worker ─────────────────────────────────────────────────

def _run_analysis_job(job_id, file_path, filename, ext, text_col):
    """
    Background worker that executes long-running analysis and updates job progress.

    Runs in a daemon thread so the HTTP layer returns immediately with a job_id.
    The frontend polls /api/analyze/status/<job_id> to track progress and retrieve
    the final result payload once status is 'completed'.
    """
    try:
        # Move job from queued -> running before any heavy disk/compute work.
        _update_analysis_job(
            job_id,
            status='running',
            progress=5,
            stage='Reading File',
            message='Loading uploaded dataset from disk...',
            error=None,
        )

        if ext == '.csv':
            with open(file_path, 'rb') as file_obj:
                df = read_csv_safe(file_obj)
        else:
            df = pd.read_excel(file_path)

        result = _analyze_dataframe(
            df=df,
            filename=filename,
            text_col=text_col,
            # Re-route core pipeline progress events into this job record.
            progress_callback=lambda progress, stage, message: _update_analysis_job(
                job_id,
                status='running',
                progress=progress,
                stage=stage,
                message=message,
            ),
        )

        _update_analysis_job(
            job_id,
            status='completed',
            progress=100,
            stage='Completed',
            message='Analysis complete.',
            result=result,
            error=None,
        )
    except ValueError as exc:
        logger.warning('Async analysis validation issue for %s: %s', filename, exc)
        _update_analysis_job(
            job_id,
            status='failed',
            progress=100,
            stage='Failed',
            message='Analysis failed due to invalid input.',
            error=str(exc),
        )
    except Exception as exc:
        logger.exception('Async analysis failed for %s', filename)
        _update_analysis_job(
            job_id,
            status='failed',
            progress=100,
            stage='Failed',
            message='Unexpected analysis failure.',
            error=str(exc),
        )
    finally:
        try:
            # Cleanup temporary upload file regardless of success/failure.
            os.remove(file_path)
        except OSError:
            pass


# ─── API routes: utility ─────────────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health_check():
    """Lightweight health-check endpoint.

    Returns the model-loaded flag so automated startup checks can verify the
    server finished loading the ML artifacts before sending traffic.
    """
    ensure_latest_classifier()
    return jsonify({
        'status': 'ok',
        'model_loaded': classifier.is_trained,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/model-info', methods=['GET'])
def model_info():
    """Return model evaluation metrics for the dashboard Model Info panel.

    Exposes accuracy, precision, recall, F1, per-class breakdown, and confusion
    matrix so the results can be displayed directly on the demo slide.
    """
    # Demo guide: use this endpoint when presenting the saved model metrics.
    ensure_latest_classifier()
    if not classifier.is_trained:
        return jsonify({'error': 'Model not trained yet'}), 400
    
    return jsonify({
        'model_type': 'Logistic Regression + TF-IDF',
        'evaluation_metrics': classifier.evaluation_metrics,
        'aspect_categories': list(ASPECT_KEYWORDS.keys())
    })


# ─── API routes: file analysis ───────────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
def upload_and_analyze():
    """
    Legacy two-step upload-preview endpoint (kept for compatibility).

    Accepts a CSV/Excel upload and returns column metadata (names, dtypes,
    and a 3-row sample) so the UI can ask the user to confirm column mappings
    before kicking off a full analysis run via /api/analyze.

    The current frontend calls /api/analyze directly, but this endpoint remains
    available for any two-step column-mapping workflow.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    
    filename: str = file.filename
    try:
        ext = _validate_extension(filename)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    
    try:
        # Read file into DataFrame with encoding fallback
        if ext == '.csv':
            df = read_csv_safe(file)
        else:
            df = pd.read_excel(file)
        
        if len(df) == 0:
            return jsonify({'error': 'Uploaded file is empty'}), 400
        
        # Return column info for user to confirm mapping
        return jsonify({
            'status': 'file_received',
            'filename': file.filename,
            'rows': len(df),
            'columns': list(df.columns),
            'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
            'sample_data': df.head(3).fillna('').to_dict(orient='records'),
            'message': 'File uploaded successfully. Use /api/analyze to process.'
        })
    
    except (UnicodeDecodeError, pd.errors.ParserError, ValueError) as exc:
        logger.warning('Upload parse issue for %s: %s', filename, exc)
        return jsonify({'error': f'Error reading file: {str(exc)}'}), 400
    except Exception as exc:
        logger.exception('Unexpected upload processing failure for %s', filename)
        return jsonify({'error': f'Unexpected upload failure: {str(exc)}'}), 500


@app.route('/api/analyze', methods=['POST'])
def analyze():
    """
    Synchronous full-pipeline analysis endpoint.

    Accepts a CSV/Excel file upload and an optional `text_column` form field.
    Runs preprocessing → sentiment → ABSA → themes → trends in a single
    blocking request and returns the complete dashboard JSON payload.

    Use this route for small files (< 5 000 rows) or development testing.
    For larger datasets, prefer the async /api/analyze/start flow.
    """
    # Demo guide: this route is the clearest input → preprocessing → output flow.
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    
    filename: str = file.filename
    try:
        ext = _validate_extension(filename)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    
    try:
        # Read file with encoding fallback
        if ext == '.csv':
            df = read_csv_safe(file)
        else:
            df = pd.read_excel(file)
        
        if len(df) == 0:
            return jsonify({'error': 'Uploaded file is empty'}), 400
        
        # Get column mappings from form data
        text_col = request.form.get('text_column', None)

        response = _analyze_dataframe(df=df, filename=filename, text_col=text_col)
        return jsonify(response)
    
    except ValueError as exc:
        logger.warning('Analysis validation issue for %s: %s', filename, exc)
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        logger.exception('Analysis failed for %s', filename)
        return jsonify({'error': f'Analysis failed: {str(exc)}'}), 500


@app.route('/api/analyze/start', methods=['POST'])
def analyze_start():
    """
    Async analysis kickoff — saves the file and launches a background thread.

    Returns a job_id immediately so the browser does not time out on large files.
    The frontend polls /api/analyze/status/<job_id> every few seconds and renders
    a live progress bar until the status transitions to 'completed' or 'failed'.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    filename: str = file.filename
    try:
        ext = _validate_extension(filename)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    text_col = request.form.get('text_column', None)

    # Persist upload to disk so the background worker can read it after request returns.
    temp_name = f"upload_{uuid.uuid4().hex}{ext}"
    temp_path = os.path.join(UPLOAD_FOLDER, temp_name)
    file.save(temp_path)

    job_id = _create_analysis_job(filename)
    # Threaded execution keeps request latency low for large datasets.
    thread = Thread(
        target=_run_analysis_job,
        args=(job_id, temp_path, filename, ext, text_col),
        daemon=True,
    )
    thread.start()

    return jsonify({
        'status': 'accepted',
        'job_id': job_id,
        'filename': filename,
    })


@app.route('/api/analyze/status/<job_id>', methods=['GET'])
def analyze_status(job_id):
    """Poll endpoint for async job progress.

    Returns stage, progress (0-100), and status fields for the progress bar.
    Once status == 'completed', the full analysis result is included under
    the `result` key so the frontend only needs to request it once.
    """
    job = _get_analysis_job(job_id)
    if not job:
        return jsonify({'error': 'Analysis job not found'}), 404

    payload = {
        'job_id': job['job_id'],
        'filename': job['filename'],
        'status': job['status'],
        'progress': job['progress'],
        'stage': job['stage'],
        'message': job['message'],
        'error': job['error'],
        'created_at': job['created_at'],
        'updated_at': job['updated_at'],
    }

    # Return the full analysis payload only after completion.
    if job['status'] == 'completed' and job.get('result') is not None:
        payload['result'] = job['result']

    return jsonify(payload)


# ─── API routes: exports ─────────────────────────────────────────────────────

@app.route('/api/export/<filename>', methods=['GET'])
def export_file(filename):
    """Serve a previously-generated export file as a browser download."""
    return send_from_directory(EXPORT_FOLDER, filename, as_attachment=True)


def _build_aspect_export_rows(data):
    """
    Flatten the nested aspect analytics payload into a list of flat row-dicts.

    Combines data from three sources:
    - aspect_summary       → mention counts, polarity, positive/negative percentages
    - aspect_theme_summary → top praise and complaint phrases per aspect
    - aspect_trends        → latest monthly sentiment snapshot

    Each row represents one aspect and is suitable for writing to CSV or JSON.
    Rows are sorted by total_mentions descending so the most-discussed aspects
    appear first in the exported file.
    """
    aspect_summary = data.get('aspect_summary') or {}
    aspect_theme_summary = data.get('aspect_theme_summary') or {}
    aspect_trend_map = ((data.get('aspect_trends') or {}).get('aspects') or {})

    if not isinstance(aspect_summary, dict) or not aspect_summary:
        return []

    def _first_phrase(bucket):
        phrases = (bucket or {}).get('phrases') or []
        if phrases and isinstance(phrases[0], (list, tuple)):
            phrase_text = str(phrases[0][0]) if len(phrases[0]) > 0 else ''
            phrase_count = int(phrases[0][1]) if len(phrases[0]) > 1 else 0
            return phrase_text, phrase_count
        return '', 0

    rows = []
    sorted_aspects = sorted(
        aspect_summary.items(),
        key=lambda item: item[1].get('total_mentions', 0),
        reverse=True,
    )
    for aspect, stats in sorted_aspects:
        theme_info = aspect_theme_summary.get(aspect) or {}
        praises = theme_info.get('praises') or {}
        complaints = theme_info.get('complaints') or {}

        top_praise_phrase, top_praise_count = _first_phrase(praises)
        top_complaint_phrase, top_complaint_count = _first_phrase(complaints)

        trend_points = aspect_trend_map.get(aspect) if isinstance(aspect_trend_map, dict) else None
        latest_trend = trend_points[-1] if isinstance(trend_points, list) and trend_points else {}

        rows.append(
            {
                'aspect': aspect,
                'total_mentions': int(stats.get('total_mentions', 0)),
                'avg_polarity': float(stats.get('avg_polarity', 0)),
                'positive_count': int(stats.get('positive_count', 0)),
                'neutral_count': int(stats.get('neutral_count', 0)),
                'negative_count': int(stats.get('negative_count', 0)),
                'positive_pct': float(stats.get('positive_pct', 0)),
                'neutral_pct': float(stats.get('neutral_pct', 0)),
                'negative_pct': float(stats.get('negative_pct', 0)),
                'praise_mentions': int(praises.get('count', 0)),
                'complaint_mentions': int(complaints.get('count', 0)),
                'top_praise_phrase': top_praise_phrase,
                'top_praise_phrase_count': top_praise_count,
                'top_complaint_phrase': top_complaint_phrase,
                'top_complaint_phrase_count': top_complaint_count,
                'latest_month': latest_trend.get('month'),
                'latest_positive_pct': latest_trend.get('positive_pct'),
                'latest_negative_pct': latest_trend.get('negative_pct'),
                'latest_net_sentiment': latest_trend.get('net_sentiment'),
            }
        )

    return rows


@app.route('/api/export-json', methods=['POST'])
def export_json():
    """
    Persist the full dashboard payload as a timestamped JSON file.

    The browser sends the current analysis results in the request body;
    the server writes them to the exports/ folder and returns a download URL.
    This lets users archive any analysis run without running it again.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        filename = f"analysis_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = os.path.join(EXPORT_FOLDER, filename)
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        return jsonify({
            'status': 'success',
            'filename': filename,
            'download_url': f'/api/export/{filename}'
        })
    
    except Exception as exc:
        logger.exception('JSON export failed')
        return jsonify({'error': str(exc)}), 500


@app.route('/api/export-aspects/json', methods=['POST'])
def export_aspects_json():
    """Export a dedicated aspect-analytics report as a JSON file.

    Accepts the analysis payload, flattens per-aspect metrics via
    _build_aspect_export_rows, appends a generation timestamp, and saves
    the result to the exports/ folder. Returns the download URL.
    """
    try:
        data = request.get_json() or {}
        if not data.get('aspect_summary'):
            return jsonify({'error': 'No aspect data provided'}), 400

        payload = dict(data)
        payload['aspect_rows'] = _build_aspect_export_rows(payload)
        payload['generated_at'] = payload.get('generated_at') or datetime.now().isoformat()

        filename = f"aspect_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = os.path.join(EXPORT_FOLDER, filename)

        with open(filepath, 'w') as f:
            json.dump(payload, f, indent=2, default=str)

        return jsonify({
            'status': 'success',
            'filename': filename,
            'download_url': f'/api/export/{filename}'
        })

    except Exception as exc:
        logger.exception('Aspect JSON export failed')
        return jsonify({'error': str(exc)}), 500


@app.route('/api/export-aspects/csv', methods=['POST'])
def export_aspects_csv():
    """Export a dedicated aspect-analytics report as a CSV file.

    Produces one row per aspect with all key metrics so recipients can open
    the file in Excel or any BI tool without further data wrangling.
    """
    try:
        data = request.get_json() or {}
        rows = _build_aspect_export_rows(data)
        if not rows:
            return jsonify({'error': 'No aspect data available for CSV export'}), 400

        filename = f"aspect_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = os.path.join(EXPORT_FOLDER, filename)

        pd.DataFrame(rows).to_csv(filepath, index=False)

        return jsonify({
            'status': 'success',
            'filename': filename,
            'download_url': f'/api/export/{filename}'
        })

    except Exception as exc:
        logger.exception('Aspect CSV export failed')
        return jsonify({'error': str(exc)}), 500


# ─── API routes: single prediction ──────────────────────────────────────────

@app.route('/api/predict', methods=['POST'])
def predict_single():
    """
    Real-time single-review sentiment prediction.

    Accepts a JSON body with a `text` field and returns:
    - predicted_sentiment  : positive / neutral / negative
    - confidence           : probability of the top label
    - probabilities        : full class probability breakdown
    - aspects              : per-aspect sentiment from ABSA

    Used by the Single Predict panel on the dashboard for live demos.
    """
    # Demo guide: use this endpoint for the single-review prototype demo.
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Please provide a "text" field'}), 400
    
    text = data['text']
    if not text.strip():
        return jsonify({'error': 'Text is empty'}), 400
    
    # Reuse training-time preprocessing for consistency with model expectations.
    processed = preprocess_text(text)
    
    # Predict plus optional rule calibration (handled in classifier).
    ensure_latest_classifier()
    label, confidence, prob_dict = classifier.predict_single(processed, raw_text=text)
    
    # ABSA
    from absa import analyze_aspects
    aspects = analyze_aspects(text)
    
    return jsonify({
        'text': text,
        'cleaned_text': clean_text(text),
        'predicted_sentiment': label,
        'confidence': round(confidence, 4),
        'probabilities': prob_dict,
        'aspects': aspects
    })


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # FLASK_DEBUG and PORT can be overridden via environment variables.
    # host='0.0.0.0' makes the server reachable from other machines on the
    # same network, which is useful for classroom demos on a shared Wi-Fi.
    debug_mode = _env_to_bool(os.getenv('FLASK_DEBUG'), default=False)
    port = int(os.getenv('PORT', '5000'))
    app.run(debug=debug_mode, port=port, host='0.0.0.0')
