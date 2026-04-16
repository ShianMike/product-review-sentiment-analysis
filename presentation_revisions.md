# Presentation Revisions

These revisions update the presentation so it matches the current implemented state of the project, not just the original proposal document.

## Recommended Changes

- Add a clear distinction between the academic proposal and the current working prototype.
- Update the architecture slide to include the asynchronous analysis job flow.
- Update the methods slide to mention TF-IDF + Logistic Regression, rule-based ABSA, theme extraction, and product/trend analytics.
- Replace placeholder performance statements with the saved model metrics from `backend/models/evaluation_metrics.joblib`.
- Replace generic demo claims with real results from the saved `amazon_review.csv` analysis output.
- Add the implemented export features and current UI views.
- End with realistic limitations: file-based workflow, no database, no persistent jobs, rule-based aspects.

## Revised Slide Structure

### Slide 1: Product Review Sentiment Analysis Dashboard

- Product Review Sentiment Analysis Dashboard Using Sentiment and Aspect-Based Sentiment Analysis
- ReviewLens
- Elective 4: Special Topics on Data Analytics 2
- This version presents the actual working prototype and current saved metrics

### Slide 2: Presentation Roadmap

- Problem and project goal
- Datasets and preprocessing
- System architecture and workflow
- Methods and techniques
- Model performance
- Working prototype and demo results
- Limitations and next steps

### Slide 3: Problem, Goal, and Scope

- Manual review analysis becomes slow and inconsistent when review volume grows
- The goal is to transform uploaded review files into sentiment, aspect, and theme insights
- The system is designed for batch CSV and Excel analysis
- The prototype is local and file-based, not a real-time production platform

### Slide 4: Datasets Used In This Project

- Training dataset: `Reviews.csv` with 568,454 rows
- Demo dataset: `amazon_review.csv` with 4,915 rows
- Demo dataset: `flipkart_product.csv` with 189,874 rows
- Demo dataset: `Walmart_reviews_data.csv` with 300 rows
- Synthetic datasets: 10,000-row and 40,000-row variants using `text`, `rating`, `date`, `product_id`, and `summary`
- Rating-to-label mapping: 1 to 2 negative, 3 neutral, 4 to 5 positive

### Slide 5: Preprocessing and Analysis Pipeline

- Validate file type and read CSV or Excel with encoding fallback
- Auto-detect review text, rating, date, product, and summary columns
- Clean text by lowercasing, removing HTML, URLs, emails, punctuation, and extra spaces
- Tokenize text, remove stopwords while keeping negations, and lemmatize when possible
- Run sentiment prediction, ABSA, theme extraction, trends, summaries, and export generation
- Cap interactive analysis to 50,000 reviews for responsiveness

### Slide 6: System Architecture and Runtime Workflow

- Frontend: React dashboard with Upload, Dashboard, Single Predict, and Model Info views
- Backend: Flask API with analysis endpoints, background jobs, status polling, exports, and single-review prediction
- Storage model: local files only, with uploads, saved models, and generated exports
- Default local run: frontend on port 4200 and backend on port 5000
- Async workflow: start analysis, poll progress, return final dashboard payload

### Slide 7: Methods and Techniques Used

- Overall sentiment classification uses TF-IDF features with Logistic Regression
- Vectorizer supports up to 50,000 features with unigram and bigram terms
- Class weighting is used to improve handling of neutral and negative classes
- Aspect-based sentiment analysis is rule-based and covers quality, price, delivery, taste, service, appearance, and usability
- Theme extraction uses TF-IDF keywords, frequent n-grams, praise and complaint buckets, and word-cloud frequencies
- Additional analytics include monthly trends, product summaries, aspect themes, and aspect trends

### Slide 8: Current Model Performance

- Model type: Logistic Regression + TF-IDF
- Accuracy: 88.59%
- Macro precision: 73.59%
- Macro recall: 71.62%
- Macro F1-score: 72.56%
- Training size: 119,999 reviews
- Test size: 30,000 reviews
- Interpretation: overall accuracy is strong, but macro metrics show that class balance still matters

### Slide 9: Working Prototype and User Flow

- Upload and Analyze view supports CSV, XLSX, and XLS files
- Async job flow shows progress messages and percent completion
- Dashboard includes Overview, Aspects, Themes, and Trends sections
- Single Predict view returns sentiment, confidence, probabilities, and detected aspects
- Model Info view shows health status, metrics, per-class scores, and confusion matrix
- Exports include processed CSV, dashboard JSON, and aspect-focused CSV or JSON

### Slide 10: Latest Demo Results From `amazon_review.csv`

- Saved analysis summary covers 4,914 processed reviews
- Sentiment distribution: 90.5% positive, 2.9% neutral, 6.6% negative
- Most mentioned aspect: usability with 3,095 mentions
- Other high-volume aspects: service with 1,755 mentions and price with 1,397 mentions
- Strong recurring phrases include `memory card`, `work great`, `samsung galaxy`, and `great price`
- The system also supports aspect trends and product-level summaries when date and product metadata exist

### Slide 11: Limitations and Next Steps

- The prototype is local and file-based
- There is no database, authentication, or persistent job queue
- ABSA is rule-based, which helps interpretability but limits flexibility
- The reviews table exists in code but is still work-in-progress in the main dashboard flow
- Future improvements: persistent jobs, more aspect coverage, multilingual support, stronger models, and deployment hardening

