# Phase 7B authenticated Preview acceptance

Verified on 2026-10-12. This continues the existing project from main checkpoint
`5621807f166900ee37451d242df57cd8fddc0abc`. The four interrupted files were preserved;
there were no other source edits at recovery. No previous source, branches or worktrees
were reset. The recovered local fixture build, typecheck, 97 TypeScript tests and
23 Python tests had already passed. The new operator scripts still needed lint and
provider/test-harness corrections.

## Hosted result

Use **https://insightflow-preview-demo.vercel.app** for the authenticated workflow.

| Setting | Verified result |
| --- | --- |
| Vercel project | insightflow-preview / prj_J3kD79zIEtR84ytA1oLqndYAUm4D |
| Account / plan | yashshah1211s-projects / Hobby |
| Final immutable deployment | https://insightflow-preview-7nwsx2nwk-yashshah1211s-projects.vercel.app |
| Deployment ID / state / target | dpl_CXZsBKNG7BHz9c1PaKLk3fGVWaxt / READY / Preview, REST target=null |
| Read-only authenticated deployment | https://insightflow-preview-ptemhp6x1-yashshah1211s-projects.vercel.app |
| Original public fallback | https://insightflow-preview-2vq7zoiw1-yashshah1211s-projects.vercel.app |
| Development database | InsightFlow-dev / dbacbcbglbqmqwxscesu |
| Public source | 10 authored illustrative fixtures / 9 exact patterns / 1 repeated row |
| Authenticated app writes | Enabled only on the new write-enabled Preview; anonymous requests denied |
| Local write flag | INSIGHTFLOW_WRITES_ENABLED=false, unchanged |

The original fallback remains READY and denies anonymous writes. The previous
production-classified bootstrap, `dpl_GcLxSm6ZU7VZLHv7Tm1LZiAnJxzU`, is still the
only production deployment. Its existing aliases were not reassigned. No new
project, production promotion, paid service, SQL migration or Auth-user
administration occurred.

The public source CSV SHA-256 is
`47227340f1060a82d7d39713a6b30fee391d0a84f73b4636795aee7831e037af`.
The 25 independently reviewed synthetic pilot examples remain local. Offline
validation confirmed 25 approvals and no PII flags. Their source lacks categories;
all 25 have unknown sentiment under the current narrow heuristic and none produces
an issue. No categories or gold-derived classifier outputs were invented for them.
Official processing still passes locally: 7,000 rows, 320 patterns, 6,680 repeats,
and 5,025 occurrences in the top 20 patterns. Neither official data nor the private
pilot/review records were transferred in this deployment.

## Configuration and authentication

Only these six names were passed as deployment/build environment configuration:
`INSIGHTFLOW_DATA_MODE=fixture`, `INSIGHTFLOW_WRITES_ENABLED`,
`INSIGHTFLOW_DEPLOYMENT_PROFILE=authenticated-preview`,
`APP_ORIGIN=https://insightflow-preview-demo.vercel.app`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`. The last two values are server-only, with the existing
development URL and low-privilege publishable key. No project-wide environment
mutation was needed. No test password, management token, service-role key,
Adaption key, NEXT_PUBLIC Supabase configuration or local env file was deployed.

The dedicated alias provides one exact origin for cookie-authenticated writes.
The immutable deployment URLs can serve public reads, but their own origins are
not the configured sign-in/write origin. This is deliberate. Assigning an alias
does not promote the deployment: see [Vercel alias documentation](https://vercel.com/docs/cli/alias).

Real email/password login posts through the application's server-side handler
and uses Supabase's password grant. It does not use a redirect flow. HTTPS login,
reload and logout passed without changing the development Auth redirect allowlist.
The exact callback URL is currently absent from that allowlist; before adding a
future email-link/PKCE or recovery flow, append only
`https://insightflow-preview-demo.vercel.app/api/auth/callback` to the development
allowlist, preserving local URLs, and test that flow separately. No such Auth
configuration change was made here. See [password authentication](https://supabase.com/docs/guides/auth/passwords)
and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Actual checks

| Verification | Result |
| --- | --- |
| npm run check: lint, typecheck, tests, production build | Passed; 97 TypeScript tests in 17 files |
| npm run test:python | Passed; 23 tests, offline provider preparation only |
| npm run package:verify | Passed relocated local official standalone package; not a Vercel data upload |
| Separate fixture production build and source/package audit | Passed; 80 source files, 480,645 bytes; 49 build traces |
| npm run security / git diff --check | Passed |
| npm audit --audit-level=low | 0 vulnerabilities |
| Local npm run smoke | Passed real read-only APIs and six-page browser navigation |
| Local npm run smoke:integration | Passed official invariants, browser workflows and labeled fault injections |
| Local npm run smoke:auth | Passed 17 suites; Auth/private response doubles explicitly labeled |
| Hosted npm run smoke and smoke:preview | Passed; 10 public workflow groups, no API response mocks |
| Hosted read-only auth acceptance | 11 checks passed using real HTTPS and Supabase |
| Hosted private acceptance | 21 checks passed, including real browser writes and database verification |
| Final build logs | 88 build events, successful compilation, 0 error events |
| Public secret-value scan | 12 HTML/API/export responses plus 16 static assets; no known private values found |

Public tests covered exact rows/patterns, missing dates/customer IDs, all five
heuristic issues and their source evidence, filtering/search/pagination, three
decision objectives, labeled hypothetical sensitivity sliders, CSV download,
print/PDF, Data Lab availability states, invalid queries and private-path denial.
All six public screens passed at 320/375/768/1440px with zero page errors or
horizontal overflow. The public mobile screenshot was also inspected.

The hosted auth run verified both designated users, Secure/HttpOnly/Lax/path=/
cookies bound to the dedicated hostname, refresh persistence, owner discovery,
public/private switching, reciprocal foreign reads, disabled writes during the
first deployment, sign-out, cleared selection and same-browser account switching.

Private writes created exactly two four-row CSV batches and one manual batch:
9 authored records and 7 batch-scoped patterns, with 2 repeated rows. Identical
CSV replay returned the same batch. Each user saved one tracking action and an
issue status update; both persisted across reload and were checked in Supabase.
Existing batches were retained. No data was deleted or reset, and interrupted
attempts reused recorded IDs rather than reimporting or duplicating actions.

All six private screens passed real in-app navigation at 320/375/1440px. Private
CSV browser downloads contained the correct four-row batch. Cross-user dashboard,
feedback, issue, decision, Data Lab, export, status and action access was denied
reciprocally. Direct RLS reads hid foreign feedback; foreign RPC reads returned
null and foreign mutation RPCs rejected the request. Malformed uploads,
cross-origin writes and public fixture issue mutations were rejected without
changing counts. Anonymous reads of private tables, protected RPC execution,
invalid bearer tokens and direct client inserts were denied.

Before/after catalog comparisons preserved nine RLS tables, nine SELECT policies,
five protected SECURITY DEFINER RPCs with empty search paths, inherited anonymous
EXECUTE denial and denial of direct INSERT/UPDATE/DELETE/TRUNCATE privileges.
The two existing Auth identities were unchanged. The application flag gates app
handlers; it does not revoke authenticated RPC permissions at the database.

No hosted response was mocked. The local auth suite uses explicit doubles,
including expiration cases; the local integration suite injects delayed/failed
responses to test loading and error recovery. Natural JWT expiry and forced
automatic browser refresh-token rotation were not observed. Already-issued JWTs
may remain usable until expiry, with owner RLS still enforced. Signup, password
recovery and PKCE links are outside this acceptance. No Adaption operation ran.

## Corrected operator/test issues

- Windows sandbox restrictions prevented Next/Vitest execution; required checks
  passed with authorized host permissions, without weakening checks.
- Script globals were made explicit to satisfy the existing ESLint rules.
- The URL guard now validates protocol/hostname/path/credentials separately,
  preserving the strict package scanner instead of embedding a URL literal.
- Vercel 63.1.2 rejected production-only `--skip-domain` with a Preview target;
  removing that flag allowed submission. Provider inspection proved no deployment
  existed before each retry; attempt ledgers were retained.
- The local harness now inherits the existing process-scoped management token
  for read-only checks. That token never enters deployment configuration.
- Composite-key tables cannot be queried using `select=id`; the row-count probe
  now uses valid table projections.
- Private browser assertions wait for authenticated batch restoration. Reports
  export waits for the restored selection and loaded report before clicking,
  avoiding cancellation when the identity/batch boundary remounts the page.
- One earlier private read parsing operation failed without sufficient original
  diagnostics to establish its cause. Independent requests validated all affected
  contracts, and subsequent complete acceptance passed with unchanged application
  contracts/source. The failed attempt is retained locally; no cause was invented.

## Recovery, boundaries and handoff

To route the dedicated hostname back to the verified read-only authenticated
deployment, use the authenticated Vercel CLI:

```powershell
vercel alias set insightflow-preview-ptemhp6x1-yashshah1211s-projects.vercel.app insightflow-preview-demo.vercel.app --scope yashshah1211s-projects
```

This changes routing only and leaves private data intact; it does not delete the
write-enabled deployment or alter SQL grants. The original public fallback also
remains independently accessible. Do not use `--prod`, `promote`, unrestricted
database push or destructive cleanup.

Local operator commands are `node scripts/deploy-authenticated-preview.mjs inspect
<installed-vercel-cli-path> writes` and `node --import tsx
scripts/hosted-preview-smoke.mjs <auth|writes>`. Existing completed ledgers refuse
fresh submissions. Narrow resume flags accept only the recorded failed states;
they do not grant authorization. Do not delete ledgers to rerun writes.

Rich ledgers, IDs, authored test CSVs, private exports and diagnostics are ignored
under `artifacts/live-preview/`. Public screenshots/audits are also ignored.
The committed JSON report contains aggregate evidence only. The deployment
allowlist excludes all artifacts, data directories, env files and operator tests.

Codex changed only server deployment configuration, scripts, tests and docs.
Antigravity-owned screens/components/styles and frozen domain v1.0.0 contracts
remain unchanged. The hosted preview demonstrates feedback ingestion, explainable
analytics, decisions, traceable issues and persistent private tracking for
authorized development users. Before submission, share the stable URL and arrange
reviewer access privately. Additional accounts or recovery flows need their own
setup/testing. Official dataset transfer and Adaption billing/execution remain
separately blocked pending permission/approval.
