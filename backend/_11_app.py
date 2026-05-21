"""
[Backend Step 11 of 13] Flask API Server - Orchestrator

This file is the Flask API server that connects the React frontend to the
backend analysis pipeline.

Runtime flow:
- Step 1: Accept CSV/Excel uploads and normalize columns  (Step 2  : _2_preprocessing)
- Step 2: Predict overall sentiment                       (Step 3  : _3_sentiment)
- Step 3: Run rule-based ABSA                             (Step 4  : _4_absa)
- Step 4: Extract per-aspect complaint/praise keywords     (Step 5  : _5_aspect_themes)
- Step 5: Build per-aspect monthly trends                  (Step 6  : _6_aspect_trends)
- Step 6: Extract global themes and keywords               (Step 7  : _7_themes)
- Step 7: Compute monthly sentiment trends                 (Step 8  : _8_trends)
- Step 8: Aggregate product-level summaries                (Step 9  : _9_product_summary)
- Step 9: Build review-table payload                       (Step 10 : _10_reviews_table)
- Step 10: Persist exports and saved projects              (Step 13 : _13_storage)
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

# ─── Internal pipeline modules (Steps 2–10) ────────────────────────────────────
# Add the backend directory so relative imports work whether the server is
# launched from the project root or from inside the backend/ folder.
sys.path.insert(0, os.path.dirname(__file__))

from _2_preprocessing import preprocess_uploaded_file, preprocess_text, clean_text
from _3_sentiment import SentimentClassifier, get_classifier
from _4_absa import analyze_aspects_batch, ASPECT_KEYWORDS
from _7_themes import generate_theme_summary
from _8_trends import build_monthly_trends
from _10_reviews_table import build_reviews_table
from _9_product_summary import build_product_summary, build_product_trends
from _5_aspect_themes import build_aspect_theme_summary
from _6_aspect_trends import build_aspect_trends
from _12_model_comparison import list_model_candidates
from _13_storage import (
    cleanup_folder,
    delete_analysis_project,
    list_analysis_projects,
    load_analysis_project,
    read_int_env,
    save_analysis_project,
    validate_project_id,
)

# ─── App initialization ──────────────────────────────────────────────────────
# Flask exposes the app's backend features through simple REST endpoints:
# upload, analysis, export, saved projects, prediction, and model information.
# static_folder=None because the React build is served by its own dev server
# (or a separate nginx/CDN layer in production).
app = Flask(__name__, static_folder=None)

# Logging is kept simple for local development and classroom demos.
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger('reviewlens.api')

# ─── File upload configuration ───────────────────────────────────────────────
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
EXPORT_FOLDER = os.path.join(os.path.dirname(__file__), 'exports')
MODEL_COMPARISON_RESULTS_PATH = os.path.join(EXPORT_FOLDER, 'model_comparison_full_training_data.json')
PROJECTS_FOLDER = os.path.join(os.path.dirname(__file__), 'projects')
# The frontend accepts common spreadsheet formats used for product review data.
ALLOWED_EXTENSIONS = {'.csv', '.xlsx', '.xls'}   # Only tabular formats are accepted
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(EXPORT_FOLDER, exist_ok=True)
os.makedirs(PROJECTS_FOLDER, exist_ok=True)


def load_model_comparison_results():
    """Load saved multi-model comparison results for the Model Info screen."""
    if not os.path.exists(MODEL_COMPARISON_RESULTS_PATH):
        return {
            'models': list_model_candidates(),
            'results': [],
            'source_file': None,
        }

    try:
        with open(MODEL_COMPARISON_RESULTS_PATH, 'r', encoding='utf-8') as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        logger.exception('Failed to load model comparison results')
        return {
            'models': list_model_candidates(),
            'results': [],
            'source_file': None,
        }

    models = payload.get('models') if isinstance(payload.get('models'), list) else list_model_candidates()
    results = payload.get('results') if isinstance(payload.get('results'), list) else []
    return {
        'models': models,
        'results': results,
        'source_file': os.path.basename(MODEL_COMPARISON_RESULTS_PATH),
    }


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
MAX_UPLOAD_FILES = read_int_env('MAX_UPLOAD_FILES', 50, minimum=1)
MAX_EXPORT_FILES = read_int_env('MAX_EXPORT_FILES', 200, minimum=1)
MAX_PROJECT_FILES = read_int_env('MAX_PROJECT_FILES', 50, minimum=1)
STORAGE_MAX_AGE_HOURS = read_int_env('STORAGE_MAX_AGE_HOURS', 168, minimum=0)
# Flask enforces the byte-level limit; werkzeug raises RequestEntityTooLarge when exceeded.
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_MB * 1024 * 1024
# Restrict CORS to only our known frontend origins to follow least-privilege principles.
CORS(app, resources={r'/api/*': {'origins': _get_cors_origins()}})


def _error_response(message, status_code=400, code='request_error', details=None):
    payload = {
        'status': 'error',
        'code': code,
        'error': str(message),
    }
    if details is not None:
        payload['details'] = details
    return jsonify(payload), status_code


def _run_storage_cleanup():
    """Clean generated upload/export/project files using retention settings."""
    cleanup_folder(UPLOAD_FOLDER, max_files=MAX_UPLOAD_FILES, max_age_hours=STORAGE_MAX_AGE_HOURS, prefixes=('upload_',))
    cleanup_folder(
        EXPORT_FOLDER,
        max_files=MAX_EXPORT_FILES,
        max_age_hours=STORAGE_MAX_AGE_HOURS,
        suffixes=('.csv', '.json'),
        prefixes=('processed_', 'analysis_summary_', 'aspect_report_', 'filtered_reviews_'),
    )
    cleanup_folder(PROJECTS_FOLDER, max_files=MAX_PROJECT_FILES, max_age_hours=STORAGE_MAX_AGE_HOURS, suffixes=('.json',))


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
    return _error_response(
        f'File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB.',
        status_code=413,
        code='file_too_large',
    )


# ─── Classifier singleton ────────────────────────────────────────────────────
# Load once at startup so the first API request does not pay the cold-start penalty.
_run_storage_cleanup()
logger.info('Loading sentiment model...')
classifier = get_classifier()


def ensure_latest_classifier():
    """Hot-reload saved model artifacts when retrained files change on disk.
    
    Called before every prediction so the running server automatically picks up
    a freshly trained model without needing a manual restart.
    """
    classifier.load_if_updated()


# ─── Async job registry ───────────────────────────────────────────────────────
# Maps job_id -> progress/result dict.
#
# Why this exists:
# - the browser should not wait on one long blocking request for large datasets
# - analysis needs multiple progress stages for a visible progress bar
# - once analysis is done, the final dashboard payload must still be retrievable
#
# A simple dict + Lock is enough for this local Flask process. A larger
# production system would use durable job storage or a queue such as Redis/Celery.
ANALYSIS_JOBS = {}
ANALYSIS_JOBS_LOCK = Lock()


def _now_utc_iso():
    """Return UTC timestamp in ISO format for job status payloads."""
    return datetime.utcnow().isoformat() + 'Z'


def _create_analysis_job(filename):
    """Create a new in-memory progress record for an analysis job.

    The resulting dict becomes the source of truth for the frontend polling
    flow. During processing, the browser reads `status`, `progress`, `stage`,
    and `message`. After completion, it also reads `result`.
    """
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
    """Safely call the optional progress callback used by async analysis jobs.

    `_analyze_dataframe` is shared by sync and async routes. This helper keeps
    the core analytics pipeline unaware of HTTP/job details:
    - sync route passes no callback -> no progress tracking is needed
    - async route passes a callback -> job registry is updated per stage
    """
    if progress_callback:
        progress_callback(progress, stage, message)


# ─── Core analytics pipeline ─────────────────────────────────────────────────

def _analyze_dataframe(df, filename, text_col=None, progress_callback=None):
    """
    Run the full review analytics pipeline for one uploaded dataset.

    Execution stages:
      Step 1: Row sampling (cap at 50 000 for predictable runtime)
      Step 2: Text preprocessing + column detection
      Step 3: TF-IDF + Logistic Regression sentiment classification
      Step 4: Aspect-based sentiment analysis (ABSA)
      Step 5: Keyword/theme extraction
      Step 6: Trend aggregation (monthly + per-aspect)
      Step 7: Build product/review table summaries
      Step 8: CSV export + final JSON response assembly

    This function is used by both:
    - `/api/analyze`, which returns the result in one request
    - `/api/analyze/start`, which stores the result inside a background job

    It returns the exact JSON shape that the frontend dashboard expects.
    Trends and product summaries are optional because uploaded files may not
    include dates or product IDs.
    """
    if len(df) == 0:
        raise ValueError('Uploaded file is empty')

    # Keep processing time predictable for classroom-scale use.
    max_rows = 50000
    if len(df) > max_rows:
        df = df.sample(n=max_rows, random_state=42)
        was_sampled = True
    else:
        was_sampled = False

    _emit_progress(progress_callback, 15, 'Preprocessing', 'Cleaning review text and detecting columns...')
    # Column auto-detection maps arbitrary user datasets into the standard
    # pipeline schema expected by the rest of the backend.
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
    # aspect_summary feeds the aspect comparison visual, while aspect_results stay
    # attached per review for exports and any future drill-down/detail views.
    aspect_results, aspect_summary = analyze_aspects_batch(original_texts)
    processed_df['aspects'] = [json.dumps(ar) for ar in aspect_results]

    # Feed the per-aspect praise/complaint insight cards shown beside aspect stats.
    aspect_theme_summary = build_aspect_theme_summary(
        processed_texts=processed_df['processed_text'].tolist(),
        aspect_results=aspect_results,
        top_n=8,
    )
    # Feed the aspect trend chart with month-over-month sentiment snapshots.
    aspect_trends = build_aspect_trends(processed_df, aspect_results, limit=8)

    _emit_progress(progress_callback, 75, 'Theme Extraction', 'Computing top keywords, phrases, and themes...')
    # Feed the keyword lists, phrase panels, complaints/praises, and word cloud.
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

    # Feed the overall monthly sentiment charts only when usable date data exists.
    trends = build_monthly_trends(processed_df, sentiment_col)

    rating_dist = None
    if 'rating' in processed_df.columns:
        # Feed the rating histogram / bar chart. Keep keys stringified for stable
        # JSON output and predictable frontend chart handling.
        rating_dist = processed_df['rating'].value_counts().sort_index().to_dict()
        rating_dist = {str(k): int(v) for k, v in rating_dist.items()}

    # Feed the product comparison cards/table plus the per-product trend chart.
    product_summary = build_product_summary(processed_df, sentiment_col)
    product_trends = build_product_trends(processed_df, sentiment_col)

    # Feed the reviews table payload. The first dashboard payload is capped for
    # speed; the Reviews tab can later ask the backend for all rows.
    reviews_data = build_reviews_table(processed_df, sentiment_col, limit=500)

    _emit_progress(progress_callback, 95, 'Export', 'Saving processed export files...')
    export_filename = f"processed_{filename.rsplit('.', 1)[0]}.csv"
    export_path = os.path.join(EXPORT_FOLDER, export_filename)
    # Keep all columns including aspects so the product drill-down endpoint
    # can re-aggregate per-product data without re-running ABSA.
    processed_df.to_csv(export_path, index=False)

    # Response keys are named to match frontend visualization sections directly.
    # This keeps the fetch/render contract simple:
    # - backend performs the heavy aggregation work once
    # - frontend receives one ready-to-render payload
    # - child components only do light reshaping for chart libraries
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
        # Surface which optional columns were successfully detected so the
        # frontend can explain why some charts or sections may be unavailable.
        'columns_detected': {
            'text': True,
            'rating': 'rating' in processed_df.columns,
            'date': 'date' in processed_df.columns,
            'product_id': 'product_id' in processed_df.columns,
            'summary': 'summary' in processed_df.columns
        }
    }

    saved_project = save_analysis_project(PROJECTS_FOLDER, response, title=filename)
    response = saved_project['result']
    _run_storage_cleanup()

    _emit_progress(progress_callback, 100, 'Completed', 'Analysis complete.')
    return response


# ─── Async background worker ─────────────────────────────────────────────────

def _run_analysis_job(job_id, file_path, filename, ext, text_col):
    """
    Process one uploaded file in the background and update job progress.

    Runs in a daemon thread so the HTTP layer returns immediately with a job_id.
    The frontend polls /api/analyze/status/<job_id> to track progress and retrieve
    the final result payload once status is 'completed'.

    This function is the bridge between:
    - the async HTTP route that starts a job
    - the shared analytics pipeline in `_analyze_dataframe`
    - the in-memory job registry used by the progress UI
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

        # Reuse the exact same pipeline and response schema as the synchronous
        # route so the dashboard sees one consistent payload shape.
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
    """Return model metrics for the dashboard Model Info panel."""
    # This endpoint backs the Model Info page and documents final-model choice.
    ensure_latest_classifier()
    if not classifier.is_trained:
        return _error_response('Model not trained yet', status_code=400, code='model_not_trained')
    
    return jsonify({
        'model_type': 'Logistic Regression + TF-IDF',
        'evaluation_metrics': classifier.evaluation_metrics,
        'candidate_models': list_model_candidates(),
        'model_comparison': load_model_comparison_results(),
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
        return _error_response('No file uploaded', status_code=400, code='missing_file')
    
    file = request.files['file']
    if not file.filename:
        return _error_response('No file selected', status_code=400, code='missing_filename')
    
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
        return _error_response(f'Error reading file: {str(exc)}', status_code=400, code='file_parse_error')
    except Exception as exc:
        logger.exception('Unexpected upload processing failure for %s', filename)
        return _error_response(f'Unexpected upload failure: {str(exc)}', status_code=500, code='upload_failed')


@app.route('/api/analyze', methods=['POST'])
def analyze():
    """
    Synchronous full-pipeline analysis endpoint.

    Accepts a CSV/Excel file upload and an optional `text_column` form field.
    Runs preprocessing → sentiment → ABSA → themes → trends in a single
    blocking request and returns the complete dashboard JSON payload.

    Use this route for small files (< 5 000 rows) or development testing.
    For larger datasets, prefer the async /api/analyze/start flow.

    Response contract:
    - returns the same final payload shape used by the async completed job flow
    - frontend dashboard sections can consume it without checking which route
      produced it
    """
    # The synchronous route preserves the clearest one-request input → pipeline
    # → response flow for small files and development testing.
    if 'file' not in request.files:
        return _error_response('No file uploaded', status_code=400, code='missing_file')
    
    file = request.files['file']
    if not file.filename:
        return _error_response('No file selected', status_code=400, code='missing_filename')
    
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

        # The sync route simply returns the pipeline output directly instead of
        # storing it in a job record first.
        response = _analyze_dataframe(df=df, filename=filename, text_col=text_col)
        return jsonify(response)
    
    except ValueError as exc:
        logger.warning('Analysis validation issue for %s: %s', filename, exc)
        return _error_response(str(exc), status_code=400, code='analysis_validation_error')
    except Exception as exc:
        logger.exception('Analysis failed for %s', filename)
        return _error_response(f'Analysis failed: {str(exc)}', status_code=500, code='analysis_failed')


@app.route('/api/analyze/start', methods=['POST'])
def analyze_start():
    """
    Start an async analysis job for a CSV/Excel upload.

    Returns a job_id immediately so the browser does not time out on large files.
    The frontend polls /api/analyze/status/<job_id> every few seconds and renders
    a live progress bar until the status transitions to 'completed' or 'failed'.

    Request/response flow:
    Step 1: Browser uploads the file here.
    Step 2: Backend saves a temporary copy and creates a job record.
    Step 3: A background thread starts processing the file.
    Step 4: Browser receives `job_id` right away and begins polling status.
    """
    if 'file' not in request.files:
        return _error_response('No file uploaded', status_code=400, code='missing_file')

    file = request.files['file']
    if not file.filename:
        return _error_response('No file selected', status_code=400, code='missing_filename')

    filename: str = file.filename
    try:
        ext = _validate_extension(filename)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    text_col = request.form.get('text_column', None)

    # Persist upload to disk so the background worker can read it after the HTTP
    # request has already returned to the browser.
    temp_name = f"upload_{uuid.uuid4().hex}{ext}"
    temp_path = os.path.join(UPLOAD_FOLDER, temp_name)
    file.save(temp_path)

    job_id = _create_analysis_job(filename)
    # Threaded execution keeps request latency low for large datasets while the
    # real analysis continues in the background.
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
        return _error_response('Analysis job not found', status_code=404, code='job_not_found')

    # Keep the progress payload small while the job is still running so polling
    # stays lightweight. The large dashboard result is attached only at the end.
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


# ─── API routes: saved analysis projects ─────────────────────────────────────

@app.route('/api/projects', methods=['GET'])
def projects_list():
    """Return metadata for analyses saved on the backend filesystem."""
    return jsonify({
        'status': 'success',
        'projects': list_analysis_projects(PROJECTS_FOLDER),
    })


@app.route('/api/projects/<project_id>', methods=['GET'])
def projects_get(project_id):
    """Return a saved analysis result by project ID."""
    try:
        validate_project_id(project_id)
    except ValueError as exc:
        return _error_response(str(exc), status_code=400, code='invalid_project_id')

    payload = load_analysis_project(PROJECTS_FOLDER, project_id)
    if not payload:
        return _error_response('Saved analysis project not found.', status_code=404, code='project_not_found')

    return jsonify({
        'status': 'success',
        'project': payload,
    })


@app.route('/api/projects/<project_id>', methods=['DELETE'])
def projects_delete(project_id):
    """Delete a saved analysis project by project ID."""
    try:
        validate_project_id(project_id)
    except ValueError as exc:
        return _error_response(str(exc), status_code=400, code='invalid_project_id')

    deleted = delete_analysis_project(PROJECTS_FOLDER, project_id)
    if not deleted:
        return _error_response('Saved analysis project not found.', status_code=404, code='project_not_found')

    return jsonify({
        'status': 'success',
        'deleted': True,
        'project_id': project_id,
    })


@app.route('/api/storage/cleanup', methods=['POST'])
def storage_cleanup():
    """Run generated-file cleanup using the configured retention settings."""
    _run_storage_cleanup()
    return jsonify({
        'status': 'success',
        'message': 'Storage cleanup completed.',
    })


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


# ─── API routes: per-product drill-down ──────────────────────────────────────

@app.route('/api/reviews', methods=['GET'])
def reviews_table():
    """
    Return the full review-table payload from a saved processed export.

    Query params:
      - file      : name of the exported CSV in backend/exports/
      - product_id: optional product identifier. Omit or pass "all" for every
                    product in the processed export.

    The main analysis response intentionally includes only a capped review list
    so the dashboard can load quickly. The Reviews tab calls this endpoint on
    demand when users need the full row-level table.
    """
    export_file = request.args.get('file', '').strip()
    product_id = request.args.get('product_id', '').strip()

    if not export_file:
        return jsonify({'error': 'The file parameter is required.'}), 400

    safe_name = os.path.basename(export_file)
    export_path = os.path.join(EXPORT_FOLDER, safe_name)

    if not os.path.isfile(export_path):
        return jsonify({'error': f'Export file not found: {safe_name}'}), 404

    try:
        df = pd.read_csv(export_path)

        if product_id and product_id != 'all':
            if 'product_id' not in df.columns:
                return jsonify({'error': 'Dataset has no product_id column.'}), 400
            df['product_id'] = df['product_id'].astype(str).str.strip()
            df = df[df['product_id'] == product_id]

        sentiment_col = 'sentiment_label' if 'sentiment_label' in df.columns else 'predicted_sentiment'
        if sentiment_col not in df.columns:
            return jsonify({'error': 'Processed export has no sentiment column.'}), 400

        reviews_data = build_reviews_table(df.reset_index(drop=True), sentiment_col, limit=None)

        return jsonify({
            'status': 'success',
            'filename': safe_name,
            'product_id': product_id or 'all',
            'total_reviews': int(len(df)),
            'reviews': reviews_data,
            'columns_detected': {
                'rating': 'rating' in df.columns,
                'date': 'date' in df.columns,
                'product_id': 'product_id' in df.columns,
                'summary': 'summary' in df.columns,
            },
        })

    except Exception as exc:
        logger.exception('Reviews table load failed for %s', safe_name)
        return jsonify({'error': str(exc)}), 500

@app.route('/api/product-analysis', methods=['GET'])
def product_analysis():
    """
    Return aspect and theme data filtered to a single product.

    Query params:
      - file      : name of the exported CSV in backend/exports/
      - product_id: product identifier to filter on

    The endpoint loads the persisted processed CSV (which includes per-review
    aspect JSON), filters to the requested product, and re-aggregates aspect
    summaries, aspect themes, aspect trends, and theme summaries from scratch.
    This avoids storing per-product breakdowns in the initial analysis payload
    and keeps the main response lean.
    """
    export_file = request.args.get('file', '').strip()
    product_id = request.args.get('product_id', '').strip()

    if not export_file or not product_id:
        return jsonify({'error': 'Both file and product_id parameters are required.'}), 400

    # Sanitize filename to prevent directory traversal.
    safe_name = os.path.basename(export_file)
    export_path = os.path.join(EXPORT_FOLDER, safe_name)

    if not os.path.isfile(export_path):
        return jsonify({'error': f'Export file not found: {safe_name}'}), 404

    try:
        df = pd.read_csv(export_path)

        if 'product_id' not in df.columns:
            return jsonify({'error': 'Dataset has no product_id column.'}), 400

        df['product_id'] = df['product_id'].astype(str).str.strip()
        filtered = df[df['product_id'] == product_id]

        if filtered.empty:
            return jsonify({'error': f'No reviews found for product: {product_id}'}), 404

        # Re-parse per-review aspect JSON stored during the original analysis.
        aspect_results = []
        if 'aspects' in filtered.columns:
            for raw in filtered['aspects']:
                try:
                    aspect_results.append(json.loads(raw) if isinstance(raw, str) else {})
                except (json.JSONDecodeError, TypeError):
                    aspect_results.append({})
        else:
            # Aspects column missing — fall back to re-running ABSA on the subset.
            original_texts = filtered['original_text'].tolist()
            aspect_results, _ = analyze_aspects_batch(original_texts)

        # Re-aggregate aspect summary from per-review aspect dicts.
        from collections import defaultdict
        aspect_agg = defaultdict(lambda: {
            'count': 0, 'positive': 0, 'neutral': 0, 'negative': 0, 'total_polarity': 0
        })
        for review_aspects in aspect_results:
            for aspect, sentiment in review_aspects.items():
                agg = aspect_agg[aspect]
                agg['count'] += 1
                label = sentiment.get('label', 'neutral')
                if label in ('positive', 'neutral', 'negative'):
                    agg[label] += 1
                agg['total_polarity'] += sentiment.get('polarity', 0)

        aspect_summary = {}
        for aspect, d in aspect_agg.items():
            c = d['count']
            aspect_summary[aspect] = {
                'total_mentions': c,
                'positive_count': d['positive'],
                'neutral_count': d['neutral'],
                'negative_count': d['negative'],
                'positive_pct': round(d['positive'] / c * 100, 1) if c else 0,
                'neutral_pct': round(d['neutral'] / c * 100, 1) if c else 0,
                'negative_pct': round(d['negative'] / c * 100, 1) if c else 0,
                'avg_polarity': round(d['total_polarity'] / c, 4) if c else 0,
            }
        aspect_summary = dict(sorted(
            aspect_summary.items(), key=lambda x: x[1]['total_mentions'], reverse=True
        ))

        # Build aspect-level praise/complaint phrases for the filtered subset.
        processed_texts = filtered['processed_text'].tolist() if 'processed_text' in filtered.columns else []
        aspect_theme_summary = build_aspect_theme_summary(
            processed_texts=processed_texts,
            aspect_results=aspect_results,
            top_n=8,
        ) if processed_texts else {}

        # Build aspect trends for the filtered subset.
        aspect_trends = build_aspect_trends(filtered.reset_index(drop=True), aspect_results, limit=8)

        # Build theme summary for the filtered subset.
        original_texts = filtered['original_text'].tolist() if 'original_text' in filtered.columns else []
        sentiment_col = 'sentiment_label' if 'sentiment_label' in filtered.columns else 'predicted_sentiment'
        sentiment_labels = filtered[sentiment_col].tolist() if sentiment_col in filtered.columns else []
        product_summary = build_product_summary(filtered, sentiment_col) if sentiment_col in filtered.columns else None
        product_sentiment = (
            product_summary['top_products'][0]
            if product_summary and product_summary.get('top_products')
            else None
        )
        theme_summary = generate_theme_summary(
            texts=original_texts,
            sentiment_labels=sentiment_labels,
            processed_texts=processed_texts,
        ) if original_texts and sentiment_labels else None

        return jsonify({
            'status': 'success',
            'product_id': product_id,
            'total_reviews': len(filtered),
            'sentiment_distribution': product_sentiment.get('sentiment_summary') if product_sentiment else None,
            'product_summary': product_sentiment,
            'aspect_summary': aspect_summary,
            'aspect_theme_summary': aspect_theme_summary,
            'aspect_trends': aspect_trends,
            'theme_summary': theme_summary,
        })

    except Exception as exc:
        logger.exception('Product analysis failed for %s', product_id)
        return jsonify({'error': str(exc)}), 500


# ─── API routes: single prediction ──────────────────────────────────────────

@app.route('/api/predict', methods=['POST'])
def predict_single():
    """
    Predict sentiment and aspects for one typed review.

    Accepts a JSON body with a `text` field and returns:
    - predicted_sentiment  : positive / neutral / negative
    - confidence           : probability of the top label
    - probabilities        : full class probability breakdown
    - aspects              : per-aspect sentiment from ABSA

    Used by the Single Predict panel to test the trained classifier without
    uploading a full dataset.
    """
    # Single-text prediction reuses the same preprocessing and classifier stack
    # as dataset analysis so behavior stays consistent.
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
    from _4_absa import analyze_aspects
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
