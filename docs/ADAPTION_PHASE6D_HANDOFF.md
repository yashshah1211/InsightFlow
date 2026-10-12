# Phase 6D: real processing, local candidate review and integration handoff

The user authorized exactly one matching Adaptive Data job with a fresh estimate
within the explicit credit ceiling, plus ordinary ingestion, polling, download
and offline validation. Those operations completed against the already uploaded
original synthetic pilot. No second adaptation, extra dataset, Forge, augmentation,
AutoScientist or model-training operation occurred.

Provider Configure completed ordinary CSV ingestion; actual metadata/status
confirmed awaiting_input, 25 rows and no run before submission. A freshly bound
quote reconciled the prior pending-state estimate without resetting its ledger.
Execution used the unchanged task config plus the documented operational
idempotency key. A one-request transport guard enforced exact /adapt body and
refused second/mismatched mutation requests. SDK retries/redirects were disabled.
The recorded execute attempt cannot be repeated, even with a different key.
Read-only polling confirmed the same actual run through terminal success; its
genuine JSONL output was downloaded through the existing run-correspondence gate.

All actual IDs/timestamps/quotes, raw responses, account observations, output,
source/gold and evaluation evidence remain under ignored
`artifacts/adaption/phase6b-synthetic/`. Start with `PHASE6D_EXECUTION.md` and
`phase6d-execution-evidence.json`. No credential or protected artifact is committed.
The standalone generated review sheet is `candidate-human-review.md`; generated
completion approvals remain blank and the training export contains zero rows.

## Import and evaluation boundaries

The actual five-field JSONL export was inspected before mapping. The versioned
mapper accepts only those columns, explicit unchanged review/hash correspondence
and complete JSON annotations. A whole JSON code fence may be unwrapped; prose,
partial JSON, altered source, extra columns, duplicates and non-null confidence
are rejected. Raw output stays immutable. Trusted importer origin/version and
unreviewed state replace unreliable generated metadata; sentiment, severity,
topics, explanations and evidence are never repaired to force validation.

All returned source records and evidence passed the existing validator. That
does not establish semantic correctness. Independent gold, authored before
provider output, was evaluated on the same full pilot alongside the unchanged
heuristic baseline. Label agreement is mixed; topic/severity disagreements and
arbitrary aspect taxonomies need genuine human review. Mixed-polarity checks
exclude unknown reference flags explicitly. Negation and unsupported explanatory
claims still require case review even when verbatim quotes pass. Provider grading
is separate from independent label agreement and declined; do not imply an
overall improvement or held-out classifier performance.

## Minimal Data Lab integration to review

`scripts/prepare-adaption-proof.ts` generated the local, unpersisted
`data-lab-integration-preview.json` from actual validated run/download/evaluation
evidence. Its run DTO passes the existing frozen AdaptionRun v1 shape. It includes
explicit original-synthetic labeling, truthful input/output/validated counts,
unreviewed candidate examples, actual artifact hashes, provider grading and
independent paired evaluation with denominators. Actual billed usage is null;
account balance is not included in this preview. It neither changes public
fixture annotations nor reads provider credentials in the browser.

Antigravity should add only a small **Separate synthetic Adaptive Data pilot**
proof section to Data Lab after separate publication/deployment approval. Use
the reviewed static allowlist or a coordinated additive proof protocol; keep
frozen batch/domain v1 unchanged. Show actual dataset/run identity, terminal state,
input → output → structurally valid counts, and unreviewed completion count.
Show any provider grades as provider grades, and reference agreement as a selected
pilot comparison with the heuristic baseline. Do not headline these as customer
metrics, model accuracy or gains. The existing 10-row public fixture and all
private batches remain separate. No database persistence was performed.

Before publishing any examples, a human must review the exact candidate payload
and source text. Human approval of completion hashes is required before exporting
curated training targets. Preserve independent gold and raw provider bytes; do
not relabel a generated answer as gold or silently map taxonomy synonyms to
increase scores. Any manual revision is a separately audited artifact.

## Safe demonstration preparation

1. Review `candidate-human-review.md` locally. Keep reviewer identity/time,
   attestations, private notes, gold labels and raw responses out of the video.
2. Review a small publication allowlist: actual run provenance/hashes/counts,
   explicit synthetic source, unreviewed status, limitations and selected
   genuinely approved candidate examples. Exclude account balances and logs.
3. Obtain separate authorization for public proof/source publication and a
   minimal Preview update. Never push local main history to the public repository;
   continue the sanitized branch under the existing release discipline.
4. Coordinate the small Data Lab view with its frontend owner; preserve six-screen
   design and current authentication/private isolation. No Adaption key on Vercel.
5. Verify anonymous proof access, truthful scope/metric labels and absence of
   protected records. Demonstrate a real data-enrichment/review workflow; do not
   claim a trained custom model, general accuracy or improvement.

No further provider job is needed to demonstrate the completed workflow. A
production classifier or a new pilot needs distinct scope/evaluation/spend
authorization. This handoff authorizes no publishing, deployment or DB write.
