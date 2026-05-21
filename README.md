# ReviewLens: Product Review Sentiment Analysis

ReviewLens is a local web application for analyzing product-review datasets. It accepts CSV or Excel files, preprocesses review text, predicts sentiment, extracts aspect-level sentiment, summarizes recurring themes, builds trend and product insights, and presents the results in an interactive React dashboard.

## Features

- **Async upload and analysis**: CSV/XLS/XLSX uploads are processed through a background Flask job with progress polling.
- **Column auto-detection**: Review text is required; rating, date, product ID, and summary/title columns are detected when available.
- **Sentiment classification**: TF-IDF + Logistic Regression predicts positive, neutral, or negative sentiment with confidence scores.
- **Aspect-based sentiment analysis**: Rule-based aspect matching and TextBlob polarity scoring identify aspect sentiment across product topics.
- **Theme extraction**: Keyword, phrase, complaint, praise, and word-cloud data are generated for dashboard exploration.
- **Trend analysis**: Monthly overall sentiment, aspect-level trends, and product-level trends are built when date data is available.
- **Product summaries**: Per-product review volume, sentiment distribution, average rating, and attention signals are computed.
- **Reviews table**: Search, sentiment filter, keyword/theme filter, date range filter, sorting, pagination, CSV export, and a review-detail modal.
- **Saved projects**: Completed analyses are persisted on the backend filesystem and can be loaded or deleted from the upload page.
- **Storage cleanup**: Generated uploads, exports, and saved project files can be cleaned up using the backend retention settings.
- **Model info**: Accuracy, precision, recall, F1, classification report, confusion matrix, and multi-model comparison results are exposed through the UI.
- **Exports**: Processed CSV, dashboard JSON, aspect CSV/JSON, and filtered Reviews-tab CSV exports are supported.

## Repository Structure

```text
.
├── backend/
│   ├── _2_preprocessing.py
│   ├── _3_sentiment.py
│   ├── _4_absa.py
│   ├── _5_aspect_themes.py
│   ├── _6_aspect_trends.py
│   ├── _7_themes.py
│   ├── _8_trends.py
│   ├── _9_product_summary.py
│   ├── _10_reviews_table.py
│   ├── _11_app.py
│   ├── _12_model_comparison.py
│   ├── _13_storage.py
│   ├── requirements.txt
│   └── tests/
├── frontend/
│   ├── src/
│   ├── package.json
│   └── README.md
├── docs/
│   └── architecture.md
└── Project.txt
```

## Backend Setup

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\_11_app.py
```

The Flask API runs on `http://localhost:5000` by default.

Useful environment variables:

```powershell
$env:PORT = "5000"
$env:FLASK_DEBUG = "false"
$env:CORS_ORIGINS = "http://localhost:3000,http://localhost:4200"
$env:MAX_UPLOAD_MB = "50"
$env:MAX_UPLOAD_FILES = "50"
$env:MAX_EXPORT_FILES = "200"
$env:MAX_PROJECT_FILES = "50"
$env:STORAGE_MAX_AGE_HOURS = "168"
```

## Frontend Setup

```powershell
npm install --workspace frontend
npm start --workspace frontend
```

Or from `frontend/`:

```powershell
npm install
$env:PORT = "4200"
npm start
```

The React app runs on `http://localhost:4200` when `PORT=4200` is set. It uses `REACT_APP_API_URL` when provided, otherwise it points to `http://localhost:5000`.

## Usage

1. Start the Flask backend.
2. Start the React frontend.
3. Open the frontend URL in a browser.
4. Upload a CSV/XLS/XLSX review dataset.
5. Click **Analyze Reviews**.
6. Wait for the progress bar to complete.
7. Explore the Dashboard tabs: Overview, Aspects, Themes, Trends, Reviews.
8. Export summaries or filtered review rows when needed.

Expected input columns:

- **Required**: review text column, such as `review`, `reviews`, `text`, `review_text`, `comment`, or `feedback`.
- **Optional**: rating/score, date/time, product identifier, summary/title.

## API Summary

- `GET /api/health`: health check and model-loaded flag.
- `GET /api/model-info`: model metrics and candidate-model comparison.
- `POST /api/upload`: legacy upload-preview endpoint.
- `POST /api/analyze`: synchronous analysis endpoint for smaller files.
- `POST /api/analyze/start`: async analysis kickoff.
- `GET /api/analyze/status/<job_id>`: async job polling endpoint.
- `GET /api/projects`: saved analysis project list.
- `GET /api/projects/<project_id>`: load saved analysis project.
- `DELETE /api/projects/<project_id>`: delete saved project.
- `POST /api/storage/cleanup`: cleanup generated files using retention limits.
- `GET /api/export/<filename>`: download generated export.
- `POST /api/export-json`: create dashboard JSON export.
- `POST /api/export-aspects/json`: create aspect JSON export.
- `POST /api/export-aspects/csv`: create aspect CSV export.
- `GET /api/reviews`: load full processed review rows.
- `GET /api/product-analysis`: compute product-scoped aspect/theme payload.
- `POST /api/predict`: predict sentiment for one review.

## Model Results

The final selected model is **Logistic Regression with TF-IDF unigrams + bigrams**. It ranked first in the saved comparison on the shared train/test split:

| Rank | Model | Accuracy | Macro Precision | Macro Recall | Macro F1 | Fit/Predict Seconds |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Logistic Regression | 0.8936 | 0.7396 | 0.7097 | 0.7237 | 10.406 |
| 2 | Linear SVM | 0.8871 | 0.7141 | 0.7178 | 0.7159 | 7.621 |
| 3 | SGD Logistic Classifier | 0.8719 | 0.6992 | 0.5998 | 0.6348 | 1.207 |
| 4 | Complement Naive Bayes | 0.8267 | 0.5978 | 0.6753 | 0.6183 | 0.300 |
| 5 | Multinomial Naive Bayes | 0.8566 | 0.8072 | 0.4746 | 0.5103 | 0.280 |

Logistic Regression was chosen because it achieved the best macro F1 and best overall accuracy while remaining fast, interpretable, and easy to persist with `joblib`.

## Testing

Backend tests:

```powershell
python -m unittest discover backend\tests
```

Frontend tests:

```powershell
npm test --workspace frontend -- --watchAll=false
```

Frontend production build:

```powershell
npm run build --workspace frontend
```

## Operational Notes

- The prototype is designed for local/classroom execution rather than multi-user cloud deployment.
- Uploads, exports, and saved projects use local filesystem folders under `backend/`.
- Saved Projects use local JSON files in `backend/projects/`; no browser file cache is required.
- File size and cleanup retention are configurable through environment variables.
- CORS is restricted to configured local frontend origins by default.
