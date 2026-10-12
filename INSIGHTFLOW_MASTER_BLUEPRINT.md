# InsightFlow — Master Technical Blueprint
Version 1.0 • Build Battle 2026 • Implementation specification

## 0. Objective and constraints
Build **InsightFlow**, an evidence-first customer-feedback decision platform. An end user can import CSV feedback or submit one review, browse and filter it, inspect data integrity, see interpretable issue/sentiment analysis, adjust transparent business priorities, track actions, and export a defensible report. Integrate **Adaption Adaptive Data meaningfully and demonstrably** as an offline/batch dataset optimization workflow. Do not market Adaption as a live inference API or claim results that were not actually produced.

Official core: feedback management, AI-powered analysis and meaningful Adaption usage, analytics, recommendations with rationale, issue tracking/reports, polished responsive website, live deployment, repo, demo. AI-assisted coding allowed; individual participation and understanding required. The problem statement says 48 hours; Unstop lists a 7-hour Round 1 as well as a 48-hour challenge; verify organizer-specific deadline before submission.

## 1. Dataset facts: acceptance-test invariants
Source: `BuildBattle_2026_Customer_Feedback_Dataset.csv` in the supplied Google Drive folder.
- Header: `review,category`; 7,000 data rows; no timestamps or customer IDs.
- 320 distinct review texts after **trim + collapse whitespace + case-fold** normalization; 6,680 repeated rows.
- Categories raw counts: Product Feedback 1,738; Customer Service 1,707; Fraud and Scam 1,755; Operational Issues 1,800.
- Distinct normalized text counts: Product Feedback 183; Customer Service 66; Fraud and Scam 35; Operational Issues 36.
- Top 20 repeated texts cover 5,025 rows.
- These **do not prove** 7,000 independent customers or a real time-series. Distinguish total records, unique text patterns, and individual customers (unavailable). Retain raw rows; never silently delete duplicates.
- Ensure phrases such as `I was not a victim of fraud` do NOT become affirmative fraud accusations; mixed-sentiment examples retain both negative and positive aspects.

## 2. Product routes
| Route | Role | Must-have |
|---|---|---|
| `/` | Command Center | Real totals, sentiment coverage, top issues, issue status, transparent data-quality notice, trends only if timestamps available |
| `/feedback` | Feedback Explorer | Search, pagination, category/sentiment filter, original records vs distinct text patterns, import and manual submit |
| `/issues` | Issue Intelligence | Specific issues (not only 4 supplied categories), evidence drill-down, status, severity, traceable recommendations |
| `/decisions` | Decision Studio | Interactive objective selector; ranks reorder deterministically with factor breakdown and supporting evidence |
| `/reports` | Report Center | Printable business report and CSV export; browser print to PDF acceptable initial version |
| `/data-lab` | Data Lab | Real CSV integrity metrics, Adaption dataset/run status, source and output provenance, evaluation evidence, limitations |

Navigation: persistent desktop sidebar, collapsible mobile sidebar, header with dataset selection/status, fast page transitions, excellent empty/loading/error states. Use accessible high-contrast, modern visual design; do not sacrifice functional UX to visual flourishes.

## 3. Tech decisions
- Next.js App Router, React, TypeScript in **one repository**.
- Tailwind + shadcn/ui (or Radix primitives) for design system; Recharts for data visualization; TanStack Table for large feedback tables; Zod for API input/output validation; Vitest for logic tests, Playwright for smoke E2E.
- Supabase Postgres for persistent data; Supabase Auth anonymous sessions recommended for personal saved actions/uploads if practical. Explicitly configure RLS and prevent exposing service-role or Adaption keys. Use server-side Next.js route handlers for writes and security-sensitive operations. A global read-only demonstration dataset can be preseeded. Never expose a publicly writeable global dataset without protection.
- Python 3.11+ pipeline (`scripts/`) with pandas + `adaption>=0.9.0` for batch preparation, estimates, adaptation, export and validation. A job can run locally before deployment; validated persisted results power the site.
- Deploy app on Vercel or compatible host with available database. Don't promise free-tier capacity. No live worker needed for the MVP.
- Repo root `AGENTS.md` plus `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/DATA_DICTIONARY.md`, `docs/ADAPTION_INTEGRATION.md`, `docs/DECISIONS.md`.

## 4. Repository skeleton and ownership
```
insightflow/
  src/app/(app)/page.tsx
  src/app/(app)/feedback/page.tsx
  src/app/(app)/issues/page.tsx
  src/app/(app)/decisions/page.tsx
  src/app/(app)/reports/page.tsx
  src/app/(app)/data-lab/page.tsx
  src/app/api/...                     # Codex-owned
  src/components/ui/                  # Antigravity-owned
  src/components/insightflow/         # Antigravity-owned
  src/lib/contracts/                  # Codex-owned frozen schemas
  src/lib/analysis/                   # Codex-owned
  src/lib/db/                         # Codex-owned
  src/lib/fixtures/                   # Codex-owned deterministic fixtures
  scripts/                            # Codex-owned Python tasks
  supabase/migrations/                # Codex-owned
  tests/                              # Codex-owned logic + contract tests
  docs/                               # Codex creates base; change only via coordination
  public/                              # Antigravity-owned illustrations/icons
```
Never have two agents write the same file at once. Codex scaffolds project and contracts first, commits checkpoint. Antigravity starts only after it reads repo docs and this commit. Codex owns API, database, scripts, test logic; Antigravity owns components and screens. For shared package manifests or layout globals, Codex creates them initially; changes afterward require owner coordination. Neither agent should rewrite or reformat the other's files.

## 5. Data model (minimum)
- `import_batches`: id, filename, source, record_count, unique_text_count, created_at, owner_id (nullable for canonical demo seed), status.
- `feedback`: id, import_batch_id, raw_text, original_category, source, normalized_hash, imported_at, observed_at nullable, owner_id nullable. Preserve one row per original input row.
- `feedback_patterns`: normalized_hash PK (or unique per scope), normalized_text, example_original_text, occurrence_count, original_category; use explicit scope/import batch to avoid cross-user leakage.
- `annotations`: normalized_hash, sentiment (`positive|negative|neutral|mixed|unknown`), issue_types (string[]), severity (`low|medium|high|critical|unknown`), explanation, evidence_quote, analyzed_by (`adaption|heuristic|manual|other`), pipeline_version, review_status, confidence nullable, updated_at. Confidence only when supported/calibrated.
- `issues`: id, workspace_id, title, category, severity, summary, status (`open|investigating|planned|resolved`), created_at, updated_at.
- `issue_evidence`: issue_id, normalized_hash, role (supporting|contradicting|context).
- `actions`: id, issue_id, description, status (`todo|in_progress|done`), notes, created_at, updated_at, owner_id.
- `adaption_runs`: id, dataset_id, run_id nullable, status, source_rows, processed_rows nullable, estimated_credits nullable, actual_credits nullable, config_json, artifact_path nullable, eval_json nullable, error_message nullable, created_at.
- Separate *import timestamp* (`imported_at`) from source event time (`observed_at`), which is null for supplied CSV.

Use database constraints, migration SQL, indexes on feedback category/hash/batch and issue status. Be disciplined about RLS; if a simple demo workspace is chosen, document the security model and tradeoffs.

## 6. Canonical API contract
Codex writes concrete request/response schemas in `src/lib/contracts` and `docs/API_CONTRACT.md` BEFORE Antigravity starts. Do not change them without coordinated versioning. All responses use either `{data: ..., meta?: ...}` or `{error: {code, message}}`. All report denominators/coverage explicit.

| Endpoint | Contract / function |
|---|---|
| `GET /api/dashboard?batchId=` | `data.summary` with `recordCount`, `uniqueTextCount`, `repeatedRecordCount`, `sentimentCounts`, `categoryCounts`, `annotationCoverage`, `timestampCoverage`; `data.topIssues`; no fabricated trend |
| `GET /api/feedback?q=&category=&sentiment=&view=records|patterns&page=&pageSize=` | `data.items`, `meta.total`, page info; schema supports rows and patterns distinctly |
| `POST /api/feedback/import` | multipart CSV, schema validation and source recording; return `batchId`, counts, rejected rows if any |
| `POST /api/feedback` | create one feedback; annotate source and auth/workspace; don't pretend synchronous Adaption run |
| `GET /api/issues?status=` | issue list with evidenceCount, scoring factors |
| `GET /api/issues/:id` | issue details, raw evidence samples and recommendations |
| `PATCH /api/issues/:id` | status/notes updates with validation & access control |
| `POST /api/issues/:id/actions` | persist action item |
| `GET /api/decisions?objective=safety|experience|operations` | ranked issues + transparent factor breakdown, methodology version |
| `GET /api/data-lab` | actual import/adaptation status, provenance, coverage, evaluation and limitations |
| `GET /api/reports/export?format=csv` | export currently selected defensible business summary CSV (PDF via print view for MVP) |

Use an explicit `dataSourceStatus`/`analysisStatus` model so the UI distinguishes `not_configured`, `pending`, `processing`, `partial`, `ready`, `failed`. Provide stable seeded fixtures for frontend work, but display sample/placeholder labels until real data exists.

## 7. Processing and business logic
1. Parse CSV robustly (quoted commas, malformed rows, max input size, encoding). Retain original row and row order.
2. `normalize_review`: Unicode normalize optional; strip, collapse whitespace, case-fold; compute SHA-256. **Never use semantic similarity for destructive deduplication.**
3. Build exact text groups with occurrence counts and batch scope. Flag potential near-duplicates separately (non-destructive), preserving negation.
4. Extract issue-level topics beyond provided coarse categories (e.g. checkout crashes, delayed delivery, missing product, defective product, unresolved service, suspect additional payment). Annotate sentiment at review level and optional aspects separately.
5. Validate annotations against original text; ensure every saved evidence quote actually occurs in the review; reject unsupported free-form certainty. Persist per-pattern provenance + version.
6. Compute transparent priority ranking. Start with configurable objective-weighted, normalized severity + share of *distinct text patterns* + negative share + evidence coverage; show those factors and their limitations. Repeated copies of a single text must not be treated as hundreds of independent customers. No fabricated dollar impact, user count or conversion rate.
7. Generate templates for actionable fixes keyed to issue type and grounded in evidence; label AI-generated suggestions where applicable. Avoid promising outcomes.
8. Manual corrections and saved tracking actions are distinct from automated predictions.
9. Time-series chart appears only if legitimate `observed_at` data exists; otherwise show 'Time trends unavailable—source contains no dates'. Import time never masquerades as a complaint date.

## 8. Actual Adaption contract and safe execution
Source: https://docs.adaptionlabs.ai/adaptive-data-quickstart and https://docs.adaptionlabs.ai/tutorials/adaptive-data-app-walkthrough/.
`adaption>=0.9.0` Python SDK supports `from adaption import Adaption`, `client.datasets.upload_file('path.csv')`, `client.datasets.get_status(dataset_id)`, `client.datasets.adapt(dataset_id, column_mapping={...}, job_specification={'max_rows': N}, estimate=True)`, `client.datasets.wait_for_completion(...)`, `client.datasets.download(dataset_id, file_format='jsonl').write_to_file(...)`.

Adaption's primary artifact is an improved **training dataset** (instruction/completion pairs), NOT an automatic low-latency production sentiment endpoint. Pilot format: CSV with `prompt` (a clear instruction asking to analyze context), `review` (source feedback), `original_category` (context); map `prompt` and context columns per documented API. A constant universal instruction may alternatively be configured through the app walkthrough. Validate whether completion output can be parsed as the target JSON schema before using it in analytics; inspect real output fields and row correspondence, not assumed schema. Make a curated 20–30 row pilot covering positive, negative, negation, mixed feedback. `estimate=True` first; no credit-consuming job until user explicitly approves the quoted estimate. After success, download and store provenance and evaluation. If API key missing or job fails, show accurate `not_configured`/`failed` UI, preserve raw-data exploration and rule-based analysis labeled `heuristic`. Do NOT show fake Adaption run IDs or invented quality improvements.

If needed, a separate offline classifier can use verified labeled examples; its provider/model must be disclosed. Optional AutoScientist requires sufficient effective training rows, model hosting, budget and time; not MVP-critical.

## 9. UI design requirements
Premium B2B design; neutral sophisticated typography; restrained blue/teal highlights, intentional use of alert amber, risk red; generous whitespace; useful density on desktop, stacked views mobile; keyboard/accessibility; light theme prioritized, dark mode optional. Use consistent component tokens, not random gradients and glassmorphism.
- Overview: compelling KPI strip, issue-risk summary, sentiment distribution with coverage, category bar, 'Data confidence' panel, priority issue cards.
- Feedback: powerful data table and full evidence details drawer, obvious records/patterns toggle, category and sentiment filters, CSV importer, manual add.
- Issues: prioritized issue listing with supporting and contradicting excerpts, recommendation and tracker control.
- Decisions: objective segmented control + ranking explanation, recompute without magic values, link to issue details.
- Reports: printable HTML summary, download CSV, traceable evidence and limitations, date when generated.
- Data Lab: actual Adaption provenance and comparison with unadapted source; explicit labels for missing or partial runs.
- Micro-interactions meaningful, fast and accessible. Skeletons/errors/empty states. No mock values silently shown in production.

## 10. Tests / acceptance gates
- CSV fixture and official CSV check: 7,000 records, 320 distinct strings, 6,680 repeated records, 4 exact category totals.
- Negation-safe heuristic: 'not a victim of fraud' cannot be positive fraud event; 'no fraudulent activity detected' cannot become affirmative fraud allegation.
- Mixed cases retain positive + negative nuance (e.g. delayed delivery but helpful support).
- Same import idempotency when user retries OR clearly recorded as separate import with explicit scope; avoid silent double counting.
- Server-side pagination/search, invalid MIME/type, malformed CSV, zero-row CSV, large file, duplicate content.
- Validated API response schemas and frontend contract tests; unauthorized writes blocked.
- No faux timelines, invented model confidence, fake credits or fake run status; all reports state limitations.
- End-to-end workflow: import -> explorer -> real issue evidence -> objective switch -> save action -> export report.
- Build, lint, typecheck, unit tests, smoke E2E must pass. Keep deployable vertical slice alive after every phase.

## 11. Work sequence / delivery gates
**Phase 1 — Codex ONLY**: scaffold, frozen API contracts and DB schema, seeded fixture, read-only APIs, ingest normalization tests, AGENTS.md, docs, initial git commit. Then release Antigravity.
**Phase 2 — parallel non-overlapping ownership**: Codex implements Supabase access and Adaption local pilot scripts, issues and report APIs. Antigravity builds UI against contract + fixture; does not modify API/schema.
**Phase 3 — integration**: UI uses live endpoints and honest states; cross-browser smoke tests; resolve contract changes together.
**Phase 4 — finish**: deployment, live smoke, concise README, sample walkthrough, 90-second demo, proof of Adaption run and evaluation.

## 12. Source links
- Official source files: https://drive.google.com/drive/folders/1xD7SngQ-902ECSmvV4ODtJ4tcO7_hl9w
- Adaption quickstart: https://docs.adaptionlabs.ai/adaptive-data-quickstart
- Adaption app walkthrough: https://docs.adaptionlabs.ai/tutorials/adaptive-data-app-walkthrough/
- Adaption AutoScientist docs: https://docs.adaptionlabs.ai/autoscientist/running-autoscientist/
- Competition: https://unstop.com/hackathons/build-battle-frontend-arena-1755980/amp
