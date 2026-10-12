# Adaption boundary — no Phase 1 jobs

Submission status, 2026-10-12: one real Adaptive Data run completed on 25 original
synthetic reviews, yielding 25 validated but unreviewed training candidates.
The separate aggregate Data Lab proof is prepared for release review; no model
was trained or activated. Independent agreement is mixed and provider grading
declined. Source/gold/output/account details remain private. See
[current status and sanitized proof](ADAPTION_SUBMISSION_STATUS.md). Earlier
phase-specific no-connection/blank-review statements below are historical.

Current Phase 4 workflow: [ADAPTION_PHASE4_WORKFLOW.md](ADAPTION_PHASE4_WORKFLOW.md). Separately gated upload/quote/execution/download commands and human-approved training curation now exist; all default to no network and none were called against the provider. Generated completions are candidate training data, never independently verified classifications. Earlier disabled-runner/interface-only sections below describe historical phases.

Source of truth: [Adaptive Data quickstart](https://docs.adaptionlabs.ai/adaptive-data-quickstart), verified 2026-10-11. Adaptive Data produces improved training datasets. This app does not treat it as synchronous review inference. Phase 1 has an artifact-import interface in src/lib/analysis/adaption.ts and explicit not_configured/runs=[]/unavailable evaluation states. No upload, estimate request, adaptation job, annotation artifact or credit spend has occurred.

Phase 2 plan: local Python 3.11+ with adaption>=0.9.0 and pandas only when the pilot is implemented. Prepare 20–30 curated examples covering positive, negative, mixed and denied allegations. Validate the real column mapping and returned output schema. The SDK supports upload_file, get_status, adapt with estimate=True, wait_for_completion and download(...).write_to_file(...). First upload/inspect only with explicit data-transfer authorization; request an estimate; record the quoted credits and exact config hash. A credit-consuming adapt call requires explicit approval of that estimate/configuration. No unattended retry may submit another paid job.

Persist only actual dataset/run IDs, config, source row counts, estimate, actual usage, artifact path, errors and evaluations. Do not guess successful status, confidence, improvement percentages or output fields. Validate each annotation against the Zod schema and exact original evidence quotes, check row correspondence, store analyzedBy=adaption with actual version/run provenance, and keep malformed output excluded from analytic coverage. Use heuristic-v1 with null confidence until validated output exists. Missing key and failed/partial runs must remain distinguishable.

ADAPTION_API_KEY belongs only in local/server environment. Never use NEXT_PUBLIC_, commit it, return it in JSON, or log request credentials. Phase 1 requires no key. This module has no network-capable implementation; adding credentials does not enable spending.

## Phase 2 offline workflow

Inspected current SDK: adaption 0.14.0, wheel SHA-256 7c9cae52faec3c2f2311f6339612ea1ef0ceef9be567d58e0d4650e5f08bcdf7, from public PyPI; source repository [Numi-Labs/adaption-python](https://github.com/Numi-Labs/adaption-python). Source inspection confirmed adapt(estimate=True), upload_file, get_status, wait_for_completion and streamed download. SDK ColumnMapping supports prompt/context without completion; the app walkthrough describes generating the missing completion. Recipe toggles and language_expansion=None are taken from SDK type definitions, not guessed fields.

Python 3.11+ preparation uses only standard library, no pandas/SDK installation or network. npm run adaption:prepare validates the official original checksum/counts and emits artifacts/adaption/pilot.csv (25 real distinct patterns), human-review.csv (blank gold labels, unreviewed), config.json and manifest.json. Counts, category histograms, raw samples, negations and conjunction examples are retained. SHA-256 binds source, config and pilot. The canonical JSON schema is generated from frozen Zod Annotation into scripts/adaption/annotation.schema.json. Source row selection is reproducible; timestamps belong only to preparation provenance.

Commands remain separate:

- npm run adaption:prepare: offline only, zero provider calls.
- npm run adaption:estimate -- --dataset-id ACTUAL_DATASET_ID --allow-network: optional quote-only request using an already uploaded, explicitly authorized dataset. Requires a local virtualenv with requirements-optional.txt and ADAPTION_API_KEY. No upload command runs automatically. SDK/docs explicitly define estimate=True as a quote without launching a run; the command rejects a returned run ID and disables retries. The config and pilot must match their manifest hashes. This command was not invoked with network permission in Phase 2.
- npm run adaption:execute: intentionally refuses paid execution. An approved visible quote/config and a separately reviewed paid runner are required in a later phase.
- npm run adaption:validate -- --input ACTUAL_NORMALIZED_JSONL --provenance ACTUAL_PROVENANCE_JSON: offline schema, source/config/artifact hash, row correspondence, exact evidence and denied-fraud checks. Provider output fields must be inspected and explicitly mapped first; never assume its output matches this canonical JSONL. Real dataset/run IDs and pipeline version are required. Unreviewed annotations keep null confidence; duplicate/missing/out-of-pilot rows are rejected. No real provider output was available or validated this phase.

Task-quality evaluation is separate from provider dataset grades: fill human-review.csv with independently verified gold sentiment/issue/severity labels. Validator currently computes sentiment accuracy only for rows with verified gold sentiment and accepted output; denominator and null-without-gold state are explicit. Issue/severity quality must also be manually evaluated before enabling analytics. A passed evidence/schema check does not prove classification accuracy or improvement.

Persist actual run provenance in adaption_runs only after approved execution and output validation: actual dataset/run IDs, source/config/artifact hashes in config_json, SDK/pipeline version, status, processed row count, estimate and actual costs when available, sanitized error, artifact path and independently measured evaluation JSON. No end-user RPC can create runs. Scoped read_feedback_batch readback exposes only real stored run summaries through /api/data-lab; when no runs exist, status remains not_configured and evaluation unavailable. A stored provider run never auto-activates annotations or a quality-gain claim.

This phase performed no Adaption upload, estimate, paid execution or external annotation import. Offline source inspection/preparation is not an Adaption run.
