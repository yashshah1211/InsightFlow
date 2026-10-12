# Phase 4 release candidate and handoff — 2026-10-11

Starting main SHA: `4b33697bd1168510cd37d61c9c7b0c141fa39fe7`. Final checkpoint SHA is supplied in the completion report and available from `git rev-parse HEAD`. Work took place in the original checkout; both Phase 2 worktrees stayed untouched. No frontend-owned sources, frozen domain schemas/examples, SQL migrations or dependency versions changed. No remote deployment, resource creation, migration, provider API call, upload, estimate or spend occurred.

## Implemented

- Shared official artifact validation at build/runtime, explicit production/Vercel data mode, and a fingerprint of the original ordered row/text/category payload. Copying checksum metadata cannot legitimize an altered record. Raw CSV and processed JSON stay ignored.
- `npm run package:verify`: seven API traces, artifact-byte equality, isolated self-contained standalone/static/public copy without secrets/raw CSV, complete 7,000-record/320-pattern HTTP retrieval, exact invariants, write 401, missing-artifact 503 and unset-production-mode 503. This is verified local production packaging, not a remotely deployed Vercel application.
- Server password sign-in, verified session, local sign-out and fixed-destination PKCE callback, with independent additive auth-1.0.0 schemas. Shared production secure/lax cookies, uncached Auth calls, multiple refresh-cookie preservation and private/no-store response headers. Reject mistaken service keys. Existing owner-derived SQL/RLS, getUser authorization, CSRF and mutation boundaries remain intact.
- Separately gated Adaption upload/estimate/execute/download commands: manifest/hash binding, finite quote checks, quote approval/age/cap, exclusive attempt reservations, no automatic retries, recorded actual returned IDs/status, nullable usage and reconciliation after uncertainty. No authorized live execution occurred; SDK compatibility is based on current docs and inspected 0.14.0 source, plus offline doubles.
- Local training-data curation: canonical row/evidence validation, independent-gold sentiment/severity/topic comparison on paired patterns, duplicate/altered/out-of-pilot gold rejection, candidate review sheet and training export only with named completion-hash-bound human approval. Generated completions do not activate classifications, analytics, fine-tuning or UI metrics.
- Operator documentation covers deployment input choices/permissions, Supabase/Auth/migrations/RLS/live acceptance/recovery, Antigravity UI boundaries and exact future pilot gates.

## Actual checks

Verified runtimes: Node v24.17.0, npm 11.13.0, Python 3.11.15.

| Command | Actual result |
| --- | --- |
| `npm run data:inspect` | Original 7,000/320/6,680; category raw 1,738/1,707/1,755/1,800 and patterns 183/66/35/36; top20 5,025; zero rejects |
| `npm run data:prepare` | 5,723,172-byte official artifact; original SHA verified; missing complaint dates preserved |
| `npm run adaption:prepare` | 25 genuine patterns; IDs/costs null; zero network calls; human gold blank |
| `npm run check` | Lint, typecheck, 82 TypeScript tests in 13 files, optimized Next 16.4 build passed |
| Final `npm run lint`, `npm run typecheck`, `npm test` | Passed after final offline validator change; 82 tests, no skipped official checks |
| `npm run test:python` | 15 passed; real-source offline preparation and explicit provider doubles, no real SDK/provider execution |
| `npm run package:verify` | Relocated package passed full HTTP data/invariant/auth-denial/failure-closed checks |
| `npm run smoke` | Public frozen GET contracts, CSV, 401 import and six-page Chromium navigation passed |
| `npm run smoke:integration` | Public workflows, four write 401s, errors/loading/recovery, CSV/print, six screens at 320/375/768/1440; zero browser page errors |
| `npm run security` | Credential/protected-artifact and whitespace scans passed |
| `npm audit --omit=dev`, `npm audit` | Zero vulnerabilities in each |

Source SHA-256 remains `82b09450e0e5144c4a21cb33a9556dab6afd7618228496e7f4c321f687250c41`. Original row fingerprint: `6416408f949678e72e3d9a530d311f11725171bb77e484595aa82b5168cf82e5`. Packaged artifact SHA-256 for this preparation: `41fcc1bf8a9df2cfc0b90c02199ac67455c24505177c0df7bdcfbee0c610e144`. Generation timestamps can change the latter on future preparation; each package verification compares exact input bytes.

Evidence is local/ignored: [package report](../artifacts/production-packages/verification.json), [browser audit](../artifacts/release/audit.json), [screenshots](../artifacts/release/SCREENSHOTS.md). Browser-only outage/fixture responses and provider doubles are explicitly test scenarios. Auth verification tests mock the provider; SQL tests execute actual PGlite transactions with Auth stubs. These do not prove remote Auth/RLS or provider compatibility. Chromium was tested, not Firefox/Safari; print invocation/CSS/headless PDF were checked, not native print UI.

## Decisions and operator next actions

1. Review/authorize dataset transfer to Vercel and exposure through the public feedback API. Recommended initial path is a CLI source deployment containing only the verified processed input; Git-only delivery is incomplete. Follow [production packaging](PRODUCTION_PACKAGING.md). No hosted artifact retrieval or data redistribution permission is assumed.
2. Choose/create your nonproduction Supabase project, email/password users, exact redirect origins and publishable API configuration. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`), `APP_ORIGIN`, explicit `INSIGHTFLOW_DATA_MODE=official`; leave writes false and service-role/Adaption keys blank in the web app. Then separately authorize migrations in order and two-user persistence/isolation tests. Follow [operator guide](SUPABASE_PRODUCTION_GUIDE.md).
3. Give Antigravity [the auth/batch UI contract](AUTH_UI_HANDOFF.md): minimal sign-in/out/session state, returned private batch selection across all reads/evidence/export, honest failures and a conservative Vercel upload ceiling. Codex owns server/contracts/tests; Antigravity owns screens/components. Frozen domain v1.0.0 and design remain preserved.
4. Choose/configure Vercel environment scopes and exact origins; authorize only a preview deployment first, verify actual functions/data/unauthenticated denial before promotion. Vercel's 4.5 MB payload limit is smaller than the backend 5 MiB CSV contract; future large issue-evidence responses may need pagination. No remote runtime result exists.
5. Independently label the local pilot gold examples before seeing provider outputs; review data-transfer rights, account/key access and pinned SDK. Separately authorize upload/preprocessing, then a quote only. Review real quote/hash/provider billing guarantees before any distinct spend approval. Follow [pilot workflow](ADAPTION_PHASE4_WORKFLOW.md).

Remaining gates: remote target/accounts/permissions, live two-user Auth/RLS/persistence, Antigravity's auth/private-selection UI, actual provider quote/output and inspected output-column mapper. Current SDK schemas do not report actual billed usage or enforce the local max-credits cap; retain null usage and confirm provider terms. No trained classifier exists. Human-approved candidate training data is a meaningful offline data workflow, not an online AI integration claim.
