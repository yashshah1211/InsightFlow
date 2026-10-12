# Phase 7: verified synthetic Vercel preview

Completed 2026-10-11. This continues the interrupted work from `7926db35abce3a02b6914867ad4e0926030583e9`; the existing changes and project were preserved. Sanitized evidence: [PHASE7_PREVIEW.json](PHASE7_PREVIEW.json).

**Actual Preview:** https://insightflow-preview-2vq7zoiw1-yashshah1211s-projects.vercel.app

| Setting | Verified value |
| --- | --- |
| Account | `yashshah1211` |
| Scope / plan | `yashshah1211s-projects` / Hobby |
| Dedicated project | `insightflow-preview` |
| Project ID | `prj_J3kD79zIEtR84ytA1oLqndYAUm4D` |
| Preview deployment | `dpl_C3btGi39izNqxvfNS4ZYhfciaauo` |
| Remote state / environment | READY / Preview; REST `target=null`, confirmed by CLI listing |
| Runtime / framework | Project Node `24.x`, Next.js `16.4.0` |
| CLI | Local `63.1.2`; Vercel build used `62.7.0` |
| Build / install | `npm run build` / `npm ci` |
| Build machine / region | Plan-default basic, 2 cores / 8 GB, `iad1` |
| Source files / bytes | 80 / 479,688 |
| Public access | `ssoProtection=null`, separately approved for this synthetic-only project |

## Recovery and environment safety

Before interruption, the deployment profile, tracing configuration, allowlist, tests and smoke scripts existed; local build/typecheck, 96 TypeScript tests and 23 Python tests had passed. Linking created the dedicated Hobby project but no deployment. Packaging checks, browser checks, documentation, deployment and checkpoint were unfinished.

Vercel link automatically added `VERCEL_OIDC_TOKEN` to ignored `.env.local`. Only that generated entry was removed before interruption. Recovery confirmed it absent, the existing Supabase/Adaption/test-account settings present, and `INSIGHTFLOW_WRITES_ENABLED=false`. The file was not recreated, transferred or committed. Duplicate ignore entries added by the CLI were removed while keeping `.vercel/` ignored.

Application screens, frozen contracts, migrations, official source bytes and private gold-review artifacts were not edited. No Supabase operation, Adaption call, paid resource, Git integration or automatic Git deployment was enabled.

## Data and configuration

The user-authorized existing authored fixtures are the demo input: **10 records, 9 normalized patterns, 1 repeated row, 5 heuristic issue groups**. Source is `fixture`, batch `fixture-batch-v1`, with explicit development-fixture labels. The ten CSV rows match the factory's exact original text/category pairs; CSV SHA-256 is `47227340f1060a82d7d39713a6b30fee391d0a84f73b4636795aee7831e037af`. These fixtures offer existing evidence and decision flows without importing gold labels or modifying the separate 25-example pilot.

Both build and runtime received only these application settings:

```text
INSIGHTFLOW_DATA_MODE=fixture
INSIGHTFLOW_WRITES_ENABLED=false
INSIGHTFLOW_DEPLOYMENT_PROFILE=synthetic-preview
```

The preview profile rejects other data modes or enabled writes and ignores Supabase configuration. Authentication, private batch discovery and private reads/writes are unavailable in this deployment. Sign-in controls remain part of the existing UI, but this preview is not an authenticated workspace. Standard mode retains official artifact loading and cookie-authenticated Supabase support.

Adaption is `not_configured` for this snapshot, with no stored runs, unavailable evaluation and unavailable recorded credits. The UI disclaims external balance and unrecorded activity. Local SDK authentication/pilot preparation is separate and not presented as a deployed provider result.

## Deployment method and target correction

Vercel received a CLI **source** package; its Next.js adapter built Functions in `/vercel/output`. Local `.next/standalone` was not uploaded or passed to `--prebuilt`.

The first command explicitly used `--target=preview`, without `--prod`. Nevertheless, Vercel classified the new project's first deployment as production and assigned `insightflow-preview.vercel.app`. This was reported immediately. [Vercel's maintainer describes this first-deployment behavior](https://community.vercel.com/t/vercel-cli-ignores-target-preview-and-creates-production-deployment/46384/7).

The user separately approved **one corrective Preview deployment**, retaining the first synthetic deployment. The second used the identical audited package and settings. Remote REST and CLI listing confirm the second deployment is READY / Preview. The initial deployment `dpl_GcLxSm6ZU7VZLHv7Tm1LZiAnJxzU` remains recorded as production in this dedicated demo project; it contains the same read-only fixtures, with no real-data production application or database connected. No other project was changed.

The complete upload manifest SHA-256 is `acc51a132e534496bd999b3de955d35a83e1d79aa0cbf6cc65626af0f1b3084c`. Both deployments were created from the then-uncommitted reviewed working tree based on the checkpoint above; deployment metadata records the base commit and manifest hash. The subsequent Git checkpoint captures those source changes plus verification documentation, without claiming the earlier build used that later commit SHA.

Reproduction requires these explicit gates; this example is documentation, not authorization for another deployment:

```powershell
npm exec --yes --package=vercel@63.1.2 -- vercel deploy --dry --json > artifacts/preview-source-manifest.json
npm run preview:verify
npm exec --yes --package=vercel@63.1.2 -- vercel deploy --target=preview --yes --project insightflow-preview --scope yashshah1211s-projects --env INSIGHTFLOW_DATA_MODE=fixture --env INSIGHTFLOW_WRITES_ENABLED=false --env INSIGHTFLOW_DEPLOYMENT_PROFILE=synthetic-preview --build-env INSIGHTFLOW_DATA_MODE=fixture --build-env INSIGHTFLOW_WRITES_ENABLED=false --build-env INSIGHTFLOW_DEPLOYMENT_PROFILE=synthetic-preview
```

Inspect the returned actual target, not just flags or the project name. A new project requires accounting for first-deployment promotion before attempting a preview-only task. Do not repeat linking or pull environment files unnecessarily: the current CLI can add an OIDC entry automatically.

## Verification results

| Local check after recovery | Result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm test` | 96 passed, 17 files |
| `npm run test:python` | 23 passed, offline |
| Fixture-profile `npm run build` | Passed optimized build |
| `npm run security` | Credential/artifact and whitespace checks passed |
| `npm run preview:verify` | 80 exact CLI input hashes; 49 build traces and 1,405 generated files inspected |
| `npm run smoke:preview` | All 10 workflow groups passed against local server |
| `npm run smoke` | GET contracts, export, denied import, six-screen/mobile navigation passed |

Both smoke commands also passed against the **actual corrective Preview URL**, without response mocks. Remote checks covered:

- Exact factory-record equality, 10/9/1 counts, missing dates/customers, nine patterns and five API pages using `pageSize=2`.
- All five issues' evidence hashes and original sample text matching the synthetic source.
- Browser records/pattern view, original-text drawer, category/sentiment filters, negation-safe search, repeated search and empty state.
- Page-size control and the real single-page boundary: all fixtures fit the UI's minimum page size of ten, so Next/Previous controls are correctly absent. Five-page traversal was tested at the API rather than claimed as a browser interaction.
- All three objective buttons and rendered rankings, calculated sensitivity output labeled hypothetical.
- Browser CSV download equal to backend bytes, export provenance, print invocation, print CSS and actual Chromium PDF generation. A native OS print dialog was not tested.
- All six screens at 320/375/768/1440px, reachable navigation, fixture disclosure and no document overflow; zero browser page errors. Twelve full-page screenshots were captured and mobile Overview inspected visually. Other browsers were not tested.
- Four mutation endpoints returning 401; batch discovery/private batch reads returning 401; invalid queries returning 400.
- Official batch lookup and raw CSV, processed artifact, environment and human-review paths returning 404.
- No recorded Adaption runs, evaluation or balance claims. Largest measured domain/API/export response: **8,589 bytes**, below Vercel's 4.5 MB ceiling.

A separate actual-URL scan inspected six HTML pages, four API/export responses and 16 served JS/CSS assets: **26 responses**, with no known local private values present. Source and generated-output scans also checked credential patterns and actual secret values in memory; no values were logged. This documents the checked payloads, not a claim of a full penetration test.

Private local evidence remains ignored under `artifacts/preview/`, plus `artifacts/preview-*.json`. The deployment allowlist excludes these records, all `data/`, all Adaption artifacts/gold labels, `.env*`, `.vercel`, `.git`, worktrees, dependency folders and local build output.

Observed verification interruptions were resolved without frontend changes: Windows sandbox filesystem restrictions required normal-access checks; a running local standalone server initially locked its rebuild directory and was stopped before rebuilding; new test assumptions were aligned with single-page controls and responsive badges; the scanner distinguished a dependency filename and verified cached 404 probe output from secrets. One initial Node remote request encountered `ECONNRESET`; independent HTTP/Node probes and the full corrective-URL suites subsequently passed. TLS verification was never disabled. Automatic review required separate public-access approval and rejected printing an ambiguous deployment environment field; the accepted inspection omits that field.

## Changed files and ownership

| Files | Purpose |
| --- | --- |
| `.env.example`, `.gitignore`, `.vercelignore` | Document optional profile; ignore link metadata; exact synthetic source allowlist |
| `next.config.ts`, `vercel.json` | Native Vercel Next adapter, mode-dependent traces, private-path exclusions and build settings |
| `src/lib/db/deployment-profile.ts`, `src/lib/db/index.ts`, `src/lib/db/supabase-config.ts` | Validate isolated preview and disable private storage configuration; preserve standard mode |
| `scripts/build-readiness.ts` | Enforce profile before build |
| `scripts/verify-preview-package.ts`, `scripts/preview-smoke.ts`, `package.json` | Actual CLI/hash/output audit and repeatable local/remote synthetic workflow verification |
| `tests/deployment-profile.test.ts` | Configuration failure, fixture counts/private denial, standard-auth preservation |
| `docs/PRODUCTION_PACKAGING.md`, this file, `PHASE7_PREVIEW.json` | Correct current exclusions, preserve permission-gated official delivery and record actual evidence |

All changes are within Codex's server/config/scripts/tests/docs ownership. No screen/component or frozen-contract handoff is required.

## Remaining submission work

No unresolved preview deployment or Hobby billing blocker remains. Hobby build/traffic quota was used; no paid resource/upgrade was enabled. Usage beyond Hobby limits is restricted rather than assumed unlimited. [Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel limits](https://vercel.com/docs/limits).

The existing `engines >=22` declaration generates a Vercel auto-upgrade warning; this deployment's inspected project setting is Node 24.x. A future runtime pin should be reviewed before another deployment.

Before final real-data release, obtain official transfer/publication permission and review a new deployment manifest. Before deploying private workspaces, separately approve exact HTTPS origin, Supabase auth/redirect settings and keys; verify live auth/isolation on that origin while keeping writes disabled until authorized. Before Adaption upload/execution, resolve billing assurance, approve the exact input/upload, obtain a reliable estimate and approve the actual spend. None of these gates was bypassed for this demo. The preview is ready to share for a synthetic, read-only walkthrough; private workspaces and completed Adaption results must not be claimed in the submission.
