# Reviewed release proposal — not published or deployed

The current local task prepares the completed synthetic pilot proof. It explicitly
stops before GitHub publication or Vercel redeployment. No provider or Supabase
mutation is required. The current public main remains
`3939daf52dd47b222c5acf04498f304fb3be5a1b` and the working live Preview remains
https://insightflow-preview-demo.vercel.app/.

## Exact review inputs

- [Aggregate proof JSON](../src/lib/analysis/adaption-public-proof.json): only
  fields documented in [the allowlist](DATA_LAB_ADAPTION_PROOF.md).
- [Release manifest](SUBMISSION_RELEASE_MANIFEST.json): intended GitHub path
  allowlist, proof SHA-256 and four exclusions. Its own content is included in
  the sanitized tree; the complete per-blob/mode manifest is recorded locally
  under ignored `artifacts/submission/final-release/snapshot-manifest.json`.
- Proposed branch `submission/adaption-release`: one successor to the published
  sanitized commit, with **no main-history ancestry**. Existing branches remain
  unchanged. Review its actual SHA/tree and diff before approving publication.
- Vercel source inputs: current `.vercelignore` allows src, seven root config
  files and only build-readiness/start-standalone scripts. The new public JSON
  belongs in src. No provider preparation script or docs is uploaded to Vercel.

New files are the aggregate JSON, strict proof schema, offline proof generator,
proof component, three safety/render tests, Data Lab documentation, release plan,
manifest and local sanitized-snapshot audit script. Existing changes are limited
to Data Lab insertion/stale copy, smoke assertions and current submission docs.
There are no API, frozen domain contract, SQL, dependency or auth logic changes.
Three existing long official review strings in an analysis test are replaced
with authored examples exercising the same positive/negative conjunction rules.
The pre-existing public parent still contains its old test strings; this proposed
successor removes them from the current tree without rewriting public history.
Original public authored fixtures and artificial unit-test examples remain; the
25 pilot review texts/completions and official dataset do not enter the release.

## Sequence after separate approval

1. Check local release commit, sanitized branch SHA/tree and exact manifest;
   rerun the bounded secret/restricted-data scan. Read `git ls-remote submission`
   and require remote main still equals the approved base above. Stop on divergence.
2. Push **only** `submission/adaption-release:main` to the existing submission
   remote. It is a fast-forward, with no force, tags, all-refs or main push.
   Never merge local main into the sanitized branch. Verify anonymous GitHub
   main SHA, recursive path/blob/mode list, README and aggregate proof against
   the reviewed manifest. Record a publication receipt locally.
3. From the audited Vercel source package, submit exactly one new **Preview** to
   existing `insightflow-preview` on Hobby, with a new exclusive attempt ledger.
   Do not reuse/overwrite old deployment ledgers or run an unrestricted old
   deployment command. Keep the existing low-privilege server-only development
   Supabase settings and authenticated-preview profile; no new variables, keys,
   provider commands, write-gate changes, projects or production target.
4. Inspect actual returned deployment ID/project/target/READY state. Treat an
   uncertain result as a read-only inspection problem; never submit blindly again.
   Preserve existing immutable Preview URLs. Validate public screens/proof on
   the immutable new Preview. Auth-origin acceptance uses the stable HTTPS
   alias, so final auth testing follows the reviewed alias move.
5. Only after approval including alias promotion, point the existing demo alias
   to the verified new Preview. Verify public screens/fixtures/proof and read-only
   existing-owner session/batch visibility, sign-out and unauthorized access.
   Do not create private test data or re-run write acceptance without authorization.
   Retain previous immutable deployment and alias target for immediate recovery.
6. If verification fails, stop. With approved alias recovery, restore the previous
   READY Preview target; never delete deployments, reset Supabase or force Git history.
   The GitHub successor can be reverted with a normal sanitized commit if needed.
7. Record the actual public commit/deployment receipt, update release status,
   record the real 90-second demonstration and access-check playback. Submit
   verified app/repo/video links plus honest Adaption explanation manually.

No additional Adaption processing, candidate approval or model training is
required for the proof. Review/approval is needed for publishing and Preview
redeployment; the organizer submission URL/deadline/timezone and actual video
remain outstanding. Exact submission deadline: **Awaiting organizer confirmation**.

Local verification: lint, typecheck, 104 TypeScript tests, 35 Python tests,
production build, offline proof regeneration, security/dry-source packaging,
synthetic browser/API smoke and 17 browser-double auth suites passed. The local
official parser still validates 7,000 rows/320 patterns/6,680 repeats; private
source/gold checksums and the disabled local write flag remain unchanged. Existing
32 live hosted Auth/private checks are historical, not re-executed write tests.

The actual Vercel CLI 63.1.2 `build --target preview` was attempted against the
isolated 84-file allowed source, with no app secrets or official/private data.
Next compilation, typecheck and all 13 static pages succeeded. Final Vercel
function packaging failed with Windows `EPERM` creating the `session.func`
symlink to `callback.func`. The local artifact is incomplete and must **not** be
deployed with `--prebuilt`. No operating-system privilege settings or adapter
dependencies were changed to force success. The approved next step should use
the existing source-deployment method and verify Vercel's actual remote READY
Preview before moving the alias. A complete new hosted build has not yet occurred.

Planning estimate after approval: about 20–40 minutes for one build/deploy,
verification and receipts, excluding provider queues, recording/upload and organizer
response. This is an estimate, not a promised completion time or event deadline.
