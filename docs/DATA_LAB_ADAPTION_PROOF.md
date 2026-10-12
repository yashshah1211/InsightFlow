# Completed synthetic pilot in Data Lab

The separate **Adaption Adaptive Data — Completed Synthetic Pilot** section reads
the static aggregate [public proof JSON](../src/lib/analysis/adaption-public-proof.json).
It is independent of the selected batch and the frozen `/api/data-lab` response.
That API continues to show only that batch's recorded runs. No Supabase run is
inserted and no candidate replaces a heuristic annotation.

One actual Adaptive Data run processed 25 original synthetic source reviews and
returned 25 structured training candidates. Source/hash, schema and verbatim
evidence checks pass for all 25; all generated candidates remain unreviewed,
with **zero human-approved training rows**. No classifier was trained or deployed.
The competition dataset and ten public fixtures were not sent to this run.

| Independent selected-pilot agreement | Candidates | Unchanged heuristics |
| --- | --- | --- |
| Sentiment | 16/25 | 2/25 |
| Severity | 6/25 | 2/25 |
| Exact issue-type sets | 6/25 | 9/25 |

Mixed-label agreement is 19/20 known references; five unknown flags are excluded.
Both polarities are preserved in 3/4 mixed examples. Exact aspect-set agreement
is 0/25, without synonym remapping. Semantic negation and explanations still need
human review. These are selected synthetic pilot observations, not generalized
model accuracy. Sentiment/severity agreement rose relative to this baseline,
while issue-set agreement fell. There is no overall improvement claim.

The provider's separate dataset grading **declined from 10.0 to 9.2, A to A**.
It is not independent task accuracy. Per-job billed usage is unavailable. Public
proof omits all credit balances and billing details.

## Reproduction and publication allowlist

Only the explicit fields validated by `PublicPilotProof` may enter the artifact:

| Field | Meaning / publication justification |
| --- | --- |
| version, provider, sourceKind, status | Separate proof format, real provider, original synthetic source and terminal success |
| datasetId, runId | Actual opaque dataset/job provenance; no user/account ID or credential |
| submittedAt, firstObservedSucceededAt, timestampMeaning | Actual execution observations in UTC; success observation is not an explicit provider completion timestamp |
| counts | Input/output/validation/unreviewed/approval aggregates; source approval is distinct from candidate approval |
| agreement | Aggregate paired sentiment, severity, exact issue sets and mixed/aspect checks with denominators; no individual labels |
| providerGrading | Real before/after scores and letter grades, identified as provider grading |
| provenance | Whole source/config/manifest/raw/normalized artifact SHA-256 and importer version; no individual review hashes or artifact contents |
| modelTrained, annotationsActivated | Both false |
| limitations | Scope, semantic review, literal taxonomy matching, unavailable billed usage and heuristic analytics disclosure |

No source text, completion, gold label, reviewer identity/time, account identifier,
raw provider body, signed URL, secret or private Supabase record is included.
The JSON is imported directly by the UI. Its content is intentionally public;
it must never load files from ignored artifacts at runtime/build or contact the provider.

Offline reproduction (requires the existing ignored evidence on this machine):

```sh
python scripts/adaption/review.py check --folder artifacts/adaption/phase6b-synthetic
node --import tsx scripts/prepare-public-adaption-proof.ts --check
```

Without `--check`, the generator deterministically rebuilds the allowlisted JSON.
It verifies source/config/pilot hashes, recorded run/attempt/download correspondence,
re-maps the actual raw bytes, compares exact normalized bytes, re-runs schema and
evidence validation, and recomputes paired/mixed/aspect evaluation against private
independent gold. It requires zero completion approvals and an empty training
export. It never serializes those private inputs wholesale. SDK/network calls: zero.

The UI/proof schema is additive release evidence, not a new API domain contract.
The task explicitly authorizes this minimal frontend exception; design ownership
otherwise stays with Antigravity. No new dependencies or six-screen redesign.

The integration is prepared locally. Publication and Preview redeployment require
review of the exact [release manifest](SUBMISSION_RELEASE_MANIFEST.json) and
separate user authorization. The existing live deployment remains the fallback.
