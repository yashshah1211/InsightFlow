# Submission repository security audit

Current release preparation, 12 October 2026: the proposed 188-file sanitized
successor excludes the same four private/catalog evidence files. The only provider
artifact proposed for publication is strict aggregate JSON: no pilot source texts,
completions, gold labels, reviewer details, raw responses, account balances or
secrets. Reproduction checks exact source/config/output hashes and real run IDs.
Known local credential values are compared in memory; none are logged.

The expanded full-record scan found three substantive official review strings
in a pre-existing analysis test. This release replaces them with authored
conjunction examples while keeping all 104 tests passing. No full official
records of 40 or more characters remain in the proposed current tree. Short
denial phrases also occur in authored rule tests and are not treated as dataset
redistribution. The existing published parent still has the three old examples
in its history; no history rewrite or deletion is performed. If organizers require
their removal from already-published history, obtain separate remediation approval.
Do not claim that a clean successor erases the previous publication.

The exact per-file blob/mode/size/SHA-256 manifest is retained under ignored
`artifacts/submission/final-release/snapshot-manifest.json`. The tracked path
allowlist and public-proof SHA-256 are in `SUBMISSION_RELEASE_MANIFEST.json`.
Main history is never published. Public fixture source, frozen contracts,
Supabase authorization logic and environment file contents remain unchanged.
Publication and Preview redeployment are pending explicit reviewed-release approval.

Publication update, 12 October 2026: the user approved the exact sanitized
171-file root commit `3939daf52dd47b222c5acf04498f304fb3be5a1b`. It was published
to https://github.com/yashshah1211/InsightFlow and anonymously verified against
every saved path/blob/mode. The four exclusions below are absent; remote main
has one commit and no other branches/tags. [Receipt](SUBMISSION_PUBLICATION.md).
The original audit narrative below describes the pre-publication state.

Base HEAD verified: ca04ceb40d597074c417908754ce0fab77f9f8d4, main, clean before
packaging. Existing branches/worktrees and all deployments were preserved.
No Git remote is configured. The connected GitHub account repository search found
no InsightFlow repository; this does not prove that no unrelated account has one.

The local audit scanned 169 tracked files and all 461 reachable objects / 298
blobs across existing refs. It compared known local secret values in memory,
checked credential patterns, protected paths and exact official/gold file bytes.
No values were printed or placed in reports. Result: zero credential/restricted
file findings. Additional pending submission documents are scanned before commit.

| Material | Finding / disposition |
| --- | --- |
| Keys, test passwords, tokens, connection credentials | No known values or credential patterns found in reachable blobs |
| .env.local / .vercel / virtualenv | Ignored; not tracked/published |
| Official CSV / processed artifact | Ignored; no exact source bytes or protected paths in Git history |
| Human-review CSV, gold, proposals and reviewer records | Ignored; no exact approved gold file bytes in Git history |
| Provider evidence, private exports, private test CSVs | Ignored artifacts; not public release inputs |
| Authored public fixtures and artificial test examples | Intentionally tracked; illustrative source, not real incidents/accuracy results |
| Historical private Supabase metadata | Two Phase 6A documents contain real private test batch/issue/action IDs and an Auth identity fingerprint |
| Public app/source package | Existing audited allowlist excludes env/data/artifacts; current public six-screen smoke verifies synthetic provenance and private-path denial |

The private metadata is not an authentication credential and grants no access
under tested RLS. It still should not be published unnecessarily. Preserve those
local evidence records, but exclude `docs/PHASE6A_LIVE_SUPABASE.md` and `.json`
from the public snapshot. Also omit the two internal machine-readable
`docs/SUPABASE_MIGRATION_*_EXECUTION.json` catalogs from that snapshot.

**Do not push the existing main history or all refs publicly.** Prepare a new
root commit from the reviewed current tree with those four files excluded,
using a GitHub no-reply author address. Keep main and every prior branch intact.
Push only the reviewed snapshot to a new repository after public approval.
This avoids publishing historical private metadata without rewriting local
history or creating a duplicate working project.

The snapshot retains source, frozen contracts, authored fixtures, tests,
schema/migrations, README, demo/checklist/architecture and sanitized verification
and Adaption connectivity proof. It contains no dataset, gold, env, runtime
output, provider payload or private acceptance ledger. Local writes remain false.

This is a bounded automated/content audit, not a guarantee that every possible
secret encoding or personal datum is detectable. Before publication, review the
snapshot manifest and run the credential scan again. No automated project
submission, data cleanup or credential rotation was performed. Public publishing
was subsequently explicitly approved and completed as recorded above.
