# Submission repository security audit

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
submission, public publishing, data cleanup or credential rotation was performed.
