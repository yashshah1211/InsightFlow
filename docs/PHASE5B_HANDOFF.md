# Phase 5B local release candidate — 2026-10-11

Verified starting main: `2c397dc623a56a186c29fc01c531cbe32a5e778a`. Phase 5A `6518ce271e2fbe996d5a38d4e42e6868380a12cd` has that exact parent. Main and the Phase 5A checkout were clean before `git merge --ff-only antigravity/phase5a-auth-ui`. All three existing worktree checkouts remain intact, unchanged and clean. Final main checkpoint SHA is reported in the completion message and available via `git rev-parse HEAD`; this document does not self-reference its containing commit.

## Exact Phase 5A integration

The commit changed precisely these 15 files:

```text
src/app/(app)/data-lab/page.tsx
src/app/(app)/decisions/page.tsx
src/app/(app)/feedback/page.tsx
src/app/(app)/issues/page.tsx
src/app/(app)/page.tsx
src/app/(app)/reports/page.tsx
src/app/layout.tsx
src/components/api-client.ts
src/components/icons.tsx
src/components/insightflow/app-shell.tsx
src/components/insightflow/auth-context.tsx
src/components/insightflow/batch-selector.tsx
src/components/insightflow/csv-import-modal.tsx
src/components/insightflow/manual-feedback-modal.tsx
src/components/insightflow/sign-in-modal.tsx
```

## Audit and fixes

Frontend sign-in/out/session routes, request fields and auth-1.0.0 responses match the server. No browser Supabase client or NEXT_PUBLIC_* configuration is needed. The external report's service-role/public-variable guidance was incorrect for this source. Corrected current setup/handoff documentation. Existing getUser verification, production Origin requirement, strict inputs, bounded bodies, safe errors, multiple refresh cookies and fixed PKCE callback remain covered. There is still no OAuth/OTP initiation, registration or password-reset UI.

Phase 5A claimed HTTP-only cookies, while the SSR defaults were not HTTP-only. Shared server cookie options now enforce HTTP-only, lax, path=/, plus secure in production. Login copy describes app-code access truthfully. Future PKCE initiation must use a coordinated server route for this cookie architecture.

Replaced client-invented batch names/times and manual UUID discovery with [GET /api/batches](BATCH_API_CONTRACT.md), separately versioned batches-1.0.0. Verified owner filtering supplements real existing workspace RLS and returns only ready upload/manual batches; no new migration or privileged client. Stable UUIDs, filename, actual counts/time, deterministic descending time/ID ordering and bounded pagination. Unauthorized/unconfigured Auth is 401; unavailable SELECT is sanitized 503; empty/foreign lookup reveals no existence.

ID-only selection restore is reauthorized, new writes refresh/verify discovery, navigation/evidence/export propagate scope, public selection clears URL/storage scope. Component remounts discard old data/forms/drawers/reports and stale async responses at identity/batch changes. HTTP success/error/CSV responses are private/no-store. Report downloads cannot finish into a view unmounted by sign-out. Private read/export 401s clear scope immediately; mutation 401s reverify Auth to distinguish revoked sessions from disabled writes. Expiration and focus/pageshow/storage checks clear private state; the periodic verified-session check preserves forms while the same session remains valid. Provider sign-out failures clear the private view and display an explicit retry instead of silently claiming logout. Initial unsigned verification cannot reset public navigation or filters (browser regression test). CSV preflight checks zero bytes, exact header and the existing 4 MiB ceiling; non-JSON failures show safe status text without exposing response bodies.

## Reproducible verification

Antigravity's external eight-suite `test-frontend-auth.ts` was found and read. Its useful scenarios were reworked into `scripts/auth-smoke.ts`, extending coverage to discovery, all private screen/evidence/export query scopes, foreign/deleted restore, new import discovery, expiration, failed sign-out and late responses. The runner uses repository-relative inputs and writes ignored artifacts under artifacts/auth; no IDE-specific paths are required.

| Command | Final result |
| --- | --- |
| npm run lint / npm run typecheck | Passed individually and within check |
| npm test | 91 passed in 15 files; zero skips |
| npm run test:python | 15 passed; offline preparation/provider doubles only |
| npm run check | Lint/typecheck/91 tests/optimized Next 16.4 build passed |
| npm run package:verify | Relocated standalone package, all 7 domain GET traces, full 7,000 rows/320 patterns/6,680 repeats; missing artifact/unset production mode fail 503 |
| npm run smoke | Real public contracts/CSV/unsigned denial, six-screen Chromium/mobile navigation passed |
| npm run smoke:integration | All public workflows, four write 401s, evidence, CSV/print, outage recovery, six screens at 320/375/768/1440; zero page errors |
| npm run smoke:auth | 17 suites passed; explicit browser Auth/private doubles, real unsigned/public APIs; zero page errors |
| npm run security | Credential/protected-artifact/whitespace checks passed |
| npm audit | Zero vulnerabilities |

Official source SHA-256: `82b09450e0e5144c4a21cb33a9556dab6afd7618228496e7f4c321f687250c41`. Packaged artifact SHA-256: `41fcc1bf8a9df2cfc0b90c02199ac67455c24505177c0df7bdcfbee0c610e144`. Category totals/patterns, top20=5,025, missing customer dates/IDs and unavailable Adaption metrics remain truthful. Frozen domain schemas/docs/examples, SQL migrations and dependency versions/lockfile are unchanged. Raw CSV, generated JSON, credentials, screenshots and pilot artifacts are not committed.

Evidence: ignored artifacts/auth/verification.json, artifacts/release/audit.json and artifacts/production-packages/verification.json. SQL isolation tests execute PGlite with Auth-role stubs, including discovery under actual RLS; PostgREST transport and Auth are doubles. Chromium was tested, not Firefox/Safari or a real Supabase account. These results do not prove remote persistence, Auth refresh/revocation or deployed Vercel function packaging.

## Operator steps and remaining gates

1. Choose a separate nonproduction Supabase project. Obtain its HTTPS URL and publishable key (legacy anon supported). Enable email/password Auth and create two confirmed test users administratively. No signup/reset flow exists here.
2. Set the exact Site URL and callback allowlist for local/chosen preview origins; callback is `/api/auth/callback`. Password login does not require a redirect. Review provider rate limits; CAPTCHA needs future coordinated request/UI changes.
3. After separate authorization, review/apply the two existing SQL migrations in filename order, recording target/checksum/result. Inspect the nine RLS tables, scoped SELECT policies, denied direct writes and five authenticated-only owner-derived RPCs. Do not use a service-role client to bypass failures.
4. Privately configure ignored .env.local: `INSIGHTFLOW_DATA_MODE=official`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` **or** `SUPABASE_ANON_KEY`, exact `APP_ORIGIN`, initially `INSIGHTFLOW_WRITES_ENABLED=false`. Leave `SUPABASE_SERVICE_ROLE_KEY` and `ADAPTION_API_KEY` blank for the web app; no NEXT_PUBLIC_SUPABASE_* names are consumed. Production secure cookies require HTTPS; use npm run dev for local HTTP Auth.
5. Verify live sign-in/reload/refresh/expiration/sign-out first. Separately enable writes for authorized authored test imports/manual records; verify retry idempotency, all private screens/evidence/reports, issue changes/actions and two-user discovery/read/write isolation. Save a private acceptance log without tokens/passwords. See [operator guide](SUPABASE_PRODUCTION_GUIDE.md).
6. The local candidate is ready for a **controlled read-only Vercel preview preparation**. Hosting/data-transfer/public distribution approval, exact environment scope/origin and the prepared ignored official JSON input are still required before deployment. Follow [packaging guide](PRODUCTION_PACKAGING.md), verify the actual remote function artifact and rerun preview smoke before promotion. Private production readiness also requires the live two-user checks above. No deployment occurred.
7. Adaption remains unconfigured. Independent gold labels, access/transfer approval, separate upload/quote/spend/download authorizations, actual returned provenance, inspected output-column mapping and human completion review remain gates. Usage stays unavailable; no trained classifier, provider call or credit spend is claimed. Follow [pilot workflow](ADAPTION_PHASE4_WORKFLOW.md).

Antigravity handoff: preserve the existing design; use AuthProvider/useAuth and discovery schemas rather than inventing batch metadata or browser tokens. Codex owns APIs/contracts/DB/scripts/tests/config/baseline docs; Antigravity owns screens/components/layout/styles. AGENTS.md records this phase's explicit minimal integration exception. Future breaking changes require coordinated versioning. No existing worktree was removed and no remote operation was performed.
