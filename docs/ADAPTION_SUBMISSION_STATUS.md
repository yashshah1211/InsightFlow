# Adaption submission explanation — one real completed synthetic pilot

InsightFlow used Adaption Adaptive Data to produce structured customer-feedback
training candidates from **25 original synthetic reviews**. Exactly one real run
succeeded and returned 25 completions. All 25 exact source/hash, schema and
verbatim-evidence checks passed. Independently approved reference labels stayed
local and were not uploaded. **All generated candidates remain unreviewed, with
zero approved training rows and no trained classifier or automatic activation.**

Independent selected-pilot agreement was 16/25 versus heuristic 2/25 for sentiment,
6/25 versus 2/25 for severity, and 6/25 versus 9/25 for exact issue sets. Mixed-label
agreement was 19/20 known references; both aspect polarities survived in 3/4 mixed
examples. Exact aspect-set agreement was 0/25 without synonym remapping. Semantic
negation and unsupported explanations still require human review.

Provider dataset grading declined **10.0 → 9.2 (A → A)**. These signals are separate
from independent label agreement, and neither establishes generalized accuracy
or overall improvement. Adaption contributes to auditable candidate preparation
and evaluation, not live sentiment inference. Existing feedback analytics remain
heuristic; the official CSV and public ten-row fixture were not processed by this run.

The pinned SDK is 0.14.0. The actual opaque dataset/run identifiers, execution
observations, checksums and aggregate results are in the
[public proof JSON](../src/lib/analysis/adaption-public-proof.json).
Source reviews, completions, gold, reviewer records, raw provider responses,
account/billing data and credentials remain ignored/local. No provider operation
runs during build/startup. Per-job actual billed usage remains unavailable.

The separate Data Lab proof and docs are prepared locally for reviewed release;
GitHub and the live Preview are not updated until separately authorized.
[Field allowlist/reproduction](DATA_LAB_ADAPTION_PROOF.md) ·
[Release plan](SUBMISSION_RELEASE_PLAN.md).

No further provider run, Forge, AutoScientist, training or paid resource is needed
or authorized for submission. The earlier connection proof remains historical
connectivity evidence; it is not the processing proof. Phase 6C/6D workflow notes
are historical audit records and must be read in their dated context.
