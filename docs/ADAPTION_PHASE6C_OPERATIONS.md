# Phase 6C deferred upload and estimate boundaries

Historical Phase 6C snapshot below. The separately authorized Phase 6D has now
completed one actual run and locally validated its output; see the
[current integration handoff](ADAPTION_PHASE6D_HANDOFF.md). No public deployment
or raw/gold publication followed. Old ledgers remain preserved.

The user explicitly authorized the reviewed original synthetic pilot's transfer,
ordinary text ingestion, status reads and nonexecuting estimate after reporting
written account-specific Adaption support confirmation. That confirmation says
ordinary text upload consumes no credits, insufficient credits block jobs, and
automatic monetary overages are unavailable without a payment method on this
account. This is user-supplied confirmation; no support email was fetched or sent.
Forge, actual Adaptive Data execution, training and official/gold transfer remain
outside authorization.

Installed SDK 0.14.0 was inspected. `datasets.create` accepts `defer_adaption=True`;
the standard `upload_file` helper cannot pass it. The upload command now accepts
`--defer-adaption`, required for the reviewed synthetic profile. It retains the
existing file/config/hash, independent gold and transfer gates, then creates the
dataset, uploads only CSV bytes to provider-signed HTTPS S3 storage, and completes
that same dataset with exact bytes/SHA. No raw-mode workaround or launch route is
used. SDK retries and HTTP redirects are disabled. Signed URLs remain in memory
only; no provider Authorization header is sent to storage.

An exclusive outer upload attempt plus create/bytes/complete stage ledgers prevent
duplicates and retain the created ID when later stages fail. Never delete/reset
those ledgers or repeat upload because ingestion is pending. Reconcile the actual
provider dataset first. The completed payload is only `review,normalized_hash`:
no official reviews, independent labels, reviewer identity, notes or credentials.

Actual creation, storage PUT, completion, dataset/status reads and an estimate-only
readiness probe succeeded. The probe used the unchanged reviewed configuration
and a transport guard allowing only dataset GETs and `/adapt` with **exactly**
`estimate=true`; launch, Forge and training routes were rejected. Its response
has estimate=true and run_id=null. Full quote/config/IDs/account observations stay
in ignored `artifacts/adaption/phase6b-synthetic/`, including
`estimate-readiness.json` and `PHASE6C_UPLOAD_ESTIMATE.md`.

The provider accepted a quote while the deferred dataset remained API `pending`,
row_count=null and UI **Awaiting preprocessing**. That is a real quote, but not
proof that the 25 rows are parsed or execution-ready. No source preview/export,
completed preprocessing, adapted output, evaluation or training was claimed.
No per-operation credit usage was returned; an unchanged account balance is
reported separately from actual usage.

The original estimate/execute readiness checks remain strict: awaiting_input,
exactly 25 rows, unchanged upload/config, fresh quote and separate explicit spend
approval. A recorded readiness-probe attempt blocks accidental duplicate quote
requests. No executable estimate.json was fabricated from an unready dataset.
First establish a provider-supported ordinary ingestion path that does not
launch adaptation/Forge; verify remote source correspondence. Do not click
start/configure controls to force progress without understanding their effects.
Any eventual quote renewal/reconciliation requires deliberate authorization;
never silently overwrite the quote or its ledger.

Future output validation uses the preserved independent human gold: exact hashes,
source text, schema, verbatim evidence, negation/mixed aspects and paired label
agreement with denominators/disagreements. Generated completions remain training
candidates until independent human approval of exact completion hashes. Quality
grades are distinct from task accuracy; no trained model is implied. Real Data
Lab provenance/curated artifacts require separately approved persistence and
coordinated additive UI/contracts; no screens, contracts, Supabase or Vercel
changes occurred here. Public GitHub was not updated.

References: [creation/defer](https://docs.adaptionlabs.ai/api/resources/datasets/methods/create),
[completion](https://docs.adaptionlabs.ai/api/resources/datasets/subresources/upload/methods/complete_by_id),
[estimate-only semantics](https://docs.adaptionlabs.ai/api/resources/datasets/methods/adapt),
[status](https://docs.adaptionlabs.ai/api/resources/datasets/methods/get_status).
