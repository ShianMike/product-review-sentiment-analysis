# Presentation Comments

These speaker comments match the revised slide structure in `presentation_revisions.md`.

## Slide 1

This project is about turning raw customer reviews into structured insights using sentiment analysis and aspect-based sentiment analysis. The actual app name used in the interface is ReviewLens, and this presentation reflects the working implementation in the repository.

## Slide 2

The flow of the presentation starts with the problem and scope, then moves into datasets, preprocessing, system architecture, methods, performance, the working prototype, real demo results, and finally the current limitations and next steps.

## Slide 3

The main problem is that manual reading of customer reviews becomes slow and inconsistent when the dataset grows. Our goal is to accept uploaded review files and automatically produce overall sentiment, aspect-level insights, theme summaries, and exportable outputs. This prototype focuses on batch analytics, not real-time scraping.

## Slide 4

The main training source is `Reviews.csv`, which contains more than half a million rows. For demos, the project also uses Amazon, Flipkart, Walmart, and synthetic datasets. The sentiment labels are derived from ratings, where low ratings are negative, three stars are neutral, and high ratings are positive.

## Slide 5

After upload, the backend validates the file and detects which columns contain review text and optional metadata. It then cleans and normalizes the text, tokenizes it, removes stopwords while preserving negations, and lemmatizes where possible. After preprocessing, it runs sentiment prediction, aspect analysis, theme extraction, trend building, and export generation.

## Slide 6

The frontend is built in React and the backend is built in Flask. One important update from the proposal stage is that the system now supports asynchronous analysis jobs, so the user can upload a file, see progress updates, and then receive the final dashboard payload when processing is complete. The project is still file-based and does not use a database.

## Slide 7

For overall sentiment classification, the project uses TF-IDF features with Logistic Regression. For aspect-based sentiment analysis, it uses a rule-based approach with keyword detection and sentence-level polarity scoring. Theme extraction adds keywords, phrases, praises, complaints, word-cloud data, and trend summaries to make the dashboard more useful.

## Slide 8

The saved model currently performs well in overall accuracy, with 88.59 percent accuracy. The macro precision, recall, and F1-scores are lower, which means class balance remains important, especially for more difficult classes like neutral. This slide should present those numbers clearly as the current saved benchmark.

## Slide 9

This is the working prototype slide. The app already supports file upload, asynchronous analysis progress, the main dashboard sections, a single-review prediction page, a model information page, and export features. This is stronger than a simple proposal because the system is already demonstrable end to end.

## Slide 10

These demo results come from the saved analysis summary of `amazon_review.csv`. The output shows that the dataset is heavily positive overall, with usability, service, and price among the most frequently discussed aspects. The recurring phrases like `memory card` and `work great` help explain what customers keep repeating in the text.

## Slide 11

The prototype is already functional, but it still has limitations. It is local, file-based, and does not persist jobs. The aspect analyzer is interpretable because it is rule-based, but it is also less flexible than a trained aspect model. The next steps are to improve persistence, coverage, multilingual handling, and deployment readiness.

