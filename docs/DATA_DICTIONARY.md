# Data dictionary

| Field/concept | Meaning |
| --- | --- |
| recordCount | Accepted original input rows, never distinct customers |
| uniqueTextCount | Distinct normalized texts within one batch |
| repeatedRecordCount | recordCount minus uniqueTextCount; raw rows remain intact |
| normalizedText/hash | Trim, collapse Unicode whitespace, Unicode case fold via pinned unicode-case-folding, SHA-256 UTF-8; no punctuation/negation removal or semantic merge |
| categoryCounts | Four supplied categories counted over raw rows |
| categoryPatternCounts | Distinct patterns present in each category; a multi-category pattern counts in each, so totals may exceed global uniqueTextCount |
| sentimentCounts | Pattern-based including mixed and unknown; never weighted as independent customers |
| annotationCoverage | Patterns with a non-unknown sentiment divided by all patterns; heuristic coverage is not validation accuracy |
| timestampCoverage | Records with actual observedAt divided by records |
| importedAt | Pipeline import time only; fixture uses fixed 2026-01-01 timestamp |
| observedAt | Source customer-event time; null for official CSV and fixtures |
| confidence | Null unless supported/calibrated; heuristics never assign numeric confidence |
| evidenceCount | Distinct supporting patterns, not repeated raw rows |
| priority.score | 0–100 weighted severity, distinct-pattern share, negative/mixed share, evidence coverage; not financial impact |
| source | fixture, official_csv, upload, manual; ingestion may not relabel an upload official without trusted verification |
| unavailable metric | status=unavailable, value=null, reason; never encode absence as zero |
| coverage.ratio | covered/total; null for zero denominator |
| rowNumber | Logical CSV row including header (first data row=2), not physical line for quoted multiline cells |

SQL workspaces identify private owner scope or curated global demo. import_batches preserve filename/content hash/counters/status; feedback preserves original text/category/order; feedback_patterns store exact groups and category histograms; annotations store versioned provenance/aspects/evidence; issues, issue_evidence and actions track verified scope and status; adaption_runs store only real external runs and credits.

Official dataset EXPECTATIONS (not measured here): 7,000 records, 320 patterns, 6,680 repeated rows. Categories: Product Feedback 1,738/183 raw/unique; Customer Service 1,707/66; Fraud and Scam 1,755/35; Operational Issues 1,800/36; top 20 texts cover 5,025 raw rows. data:inspect validates these only when the official file is placed at data/raw/customer_feedback.csv. No source customer IDs or dates exist.

Cross-category exact groups retain a histogram. Near-duplicates are deferred; future suggestions must keep negation and raw evidence, never merge or delete by semantic similarity.
