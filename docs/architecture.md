# ReviewLens Architecture

## Overview

ReviewLens uses a two-tier local web architecture:

```text
Browser / React UI
  ↓ REST API calls
Flask API server
  ↓ pandas + NLP/ML pipeline
Local generated files and model artifacts
```

The frontend owns user interaction, upload state, dashboard rendering, saved-project controls, filtering, sorting, and client-side CSV export of the currently filtered Reviews view. The backend owns file parsing, preprocessing, model inference, aspect analysis, aggregation, saved projects, generated-file cleanup, and generated export files.

## Runtime Data Flow

1. The user selects a CSV, XLS, or XLSX file in the React upload page.
2. `FileUpload` sends the file to `POST /api/analyze/start`.
3. Flask validates the extension, writes a temporary upload file, creates an in-memory job record, and starts a daemon thread.
4. The frontend polls `GET /api/analyze/status/<job_id>`.
5. The background worker reads the file into pandas and calls `_analyze_dataframe`.
6. The backend emits progress updates for preprocessing, sentiment classification, aspect analysis, theme extraction, summarization, export, and completion.
7. When complete, the final dashboard payload is stored in the job record and returned through the status endpoint.
8. React stores the payload in `App` state and renders `Dashboard` with the same result object for every tab.
9. The completed result is persisted on the backend as a saved project so it can be loaded again from the upload page.

## Backend Components

### `_11_app.py`

Main Flask API orchestrator. It wires all pipeline modules into REST endpoints:

- health and model info
- upload preview
- synchronous analysis
- asynchronous analysis jobs
- saved projects
- exports
- full Reviews-tab row loading
- product-scoped drill-down
- single-review prediction

It also configures CORS, upload size limits, logging, temporary upload cleanup, generated-file cleanup, and the singleton sentiment classifier.

### `_2_preprocessing.py`

Normalizes uploaded datasets into the schema expected by downstream steps:

- detects review text column
- detects rating, date, product, and summary columns when present
- cleans text by lowercasing, removing HTML, URLs, emails, punctuation, and extra whitespace
- preserves sentiment-critical negations during stopword removal
- lemmatizes tokens
- derives weak sentiment labels from ratings and TextBlob polarity for ambiguous ratings

### `_3_sentiment.py`

Loads and applies the persisted sentiment model. The selected production model is TF-IDF with Logistic Regression. It returns predicted labels and class probabilities used for confidence scores and dashboard summaries.

### `_4_absa.py`

Runs rule-based aspect detection using keyword dictionaries and boundary-aware matching. For detected aspects, TextBlob polarity is mapped to positive, neutral, or negative labels.

### `_5_aspect_themes.py` and `_6_aspect_trends.py`

Build per-aspect theme summaries and per-aspect monthly sentiment trends. These outputs power the Aspects tab's insight cards and trend views.

### `_7_themes.py`

Extracts global themes:

- overall keywords
- recurring phrases
- themes by sentiment
- complaint and praise summaries
- word-cloud frequency payloads

### `_8_trends.py`

Builds monthly sentiment trend data from parsed dates. If date data is missing or unparseable, the rest of the analysis still succeeds while trend payloads remain empty.

### `_9_product_summary.py`

Aggregates product-level metrics:

- total reviews per product
- average rating
- sentiment counts and percentages
- attention level
- highest-volume and needs-attention product
- product-level trend points

### `_10_reviews_table.py`

Creates row-level data for the Reviews tab, including text, metadata, predicted sentiment, confidence, and parsed aspects.

### `_12_model_comparison.py`

Defines the candidate model set and evaluation routine for multi-model comparison:

- Logistic Regression
- Linear SVM
- Multinomial Naive Bayes
- Complement Naive Bayes
- SGD Logistic Classifier

### `_13_storage.py`

Encapsulates filesystem persistence concerns:

- saved-project IDs
- saved-project JSON writes
- project list/load/delete helpers
- retention cleanup helpers
- environment integer parsing

## Frontend Components

### `App.js`

Top-level coordinator. It stores the current analysis result and switches to the Dashboard tab when analysis completes.

### `_3_FileUpload.js`

Owns the upload workflow:

- file selection through `react-dropzone`
- async analyze job creation
- polling job status
- progress bar state
- backend saved-project list/load/delete actions
- generated-file cleanup action for uploads, exports, and saved project files

### `_4_Dashboard.js`

Receives the completed backend payload and routes it into dashboard sections:

- Overview
- Aspects
- Themes
- Trends
- Reviews

It also exposes processed CSV and dashboard JSON export actions.

### Dashboard children

- `_8_SentimentOverview.js`: top-level sentiment, ratings, model confidence, and product snapshot.
- `_9_AspectAnalysis.js`: aspect sentiment, aspect trends, aspect exports, and product-specific aspect drill-down.
- `_10_ThemeSummary.js`: keywords, phrases, complaints, praises, and word-cloud data.
- `_11_TrendChart.js`: overall and product trend charts.
- `_12_ReviewsTable.js`: row-level exploration, filtering, sorting, pagination, details modal, and filtered CSV export.

## Data Contracts

The completed analysis payload includes:

```json
{
  "status": "success",
  "filename": "reviews.csv",
  "total_reviews": 1000,
  "was_sampled": false,
  "sentiment_distribution": {},
  "aspect_summary": {},
  "aspect_theme_summary": {},
  "aspect_trends": {},
  "theme_summary": {},
  "trends": [],
  "product_summary": {},
  "product_trends": {},
  "rating_distribution": {},
  "reviews": [],
  "export_file": "processed_reviews.csv",
  "columns_detected": {},
  "project_id": "...",
  "project_title": "reviews.csv",
  "project_saved_at": "..."
}
```

The dashboard treats this object as the single source of truth. Child components only reshape data for presentation.

## Persistence and Storage

### Backend filesystem

- `backend/uploads/`: temporary upload files for async jobs.
- `backend/exports/`: generated processed CSV and JSON/CSV exports.
- `backend/projects/`: saved completed analysis payloads.
- model artifacts are loaded by the sentiment classifier module.

Generated-file cleanup is controlled by:

- `MAX_UPLOAD_FILES`
- `MAX_EXPORT_FILES`
- `MAX_PROJECT_FILES`
- `STORAGE_MAX_AGE_HOURS`

### Saved analysis storage

- `backend/projects/`: saved analysis payload JSON files.
- `backend/exports/`: generated CSV/JSON reports.
- `backend/uploads/`: temporary uploaded files.

Saved Projects provide reload/delete actions for completed analyses, while retention settings and the cleanup endpoint manage generated files.

## Model Selection Rationale

All candidate models used TF-IDF unigram + bigram features and were evaluated on the same train/test split. Logistic Regression was selected because it ranked first by macro F1 and accuracy while maintaining a simple, explainable linear model suitable for classroom demonstration and local deployment.

Saved comparison results:

| Rank | Model | Accuracy | Macro F1 |
|---:|---|---:|---:|
| 1 | Logistic Regression | 0.8936 | 0.7237 |
| 2 | Linear SVM | 0.8871 | 0.7159 |
| 3 | SGD Logistic Classifier | 0.8719 | 0.6348 |
| 4 | Complement Naive Bayes | 0.8267 | 0.6183 |
| 5 | Multinomial Naive Bayes | 0.8566 | 0.5103 |

## Operational Constraints

- The job registry is in memory, so async job state is not preserved across backend restarts.
- The storage layer is local filesystem-based, not a production database.
- The row cap keeps runtime predictable for classroom-scale demonstrations.
- The application should not be treated as hardened multi-tenant infrastructure without authentication, persistent job storage, rate limiting, and production object storage.

## Verification Commands

Backend:

```powershell
python -m unittest discover backend\tests
```

Frontend:

```powershell
npm test --workspace frontend -- --watchAll=false
npm run build --workspace frontend
```
