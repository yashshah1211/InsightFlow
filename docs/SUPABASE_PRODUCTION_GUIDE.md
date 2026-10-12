# Supabase + Vercel setup — operator guide

This is a prepared procedure, not authorization to run it. Phase 4 creates no project, account, migration, remote write or deployment. Start with a separate nonproduction project and two test users. Follow [official password Auth](https://supabase.com/docs/guides/auth/passwords), [SSR sessions](https://supabase.com/docs/guides/auth/server-side/nextjs), [RLS/grants](https://supabase.com/docs/guides/database/postgres/row-level-security) and [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), checked 2026-10-11.

Development status, Phase 6A: both migrations have been applied to `InsightFlow-dev` outside CLI history, and [real two-user persistence/isolation acceptance passed](PHASE6A_LIVE_SUPABASE.md). This does not authorize production operations. Writes are restored to false, which gates the app but does not revoke authenticated RPC grants. Logout clears the browser session; an already issued JWT may remain valid until expiry. Natural expiry and automatic browser cookie refresh were not forced in the live run.

## 1. Choose and configure your project

Sign in to Supabase, create a project in your chosen organization/region/plan, and privately save its database password. Wait for provisioning. In project settings obtain the project URL and **publishable** API key (legacy anon key also supported). The application does not require the database password, secret key or service-role key. A migration administrator needs separate privileged access; never place that access in browser configuration or this application's RPC client.

In Authentication enable email/password sign-in. For the initial controlled test, create two confirmed users with distinct email/password credentials through the administrative user interface; do not enable anonymous sign-in. The app has sign-in/out/session routes, no self-registration or password-reset endpoint. Configure production SMTP/confirmation templates before opening any registration/recovery flow; those flows need Antigravity implementation. Review Auth rate limits and access restrictions before exposing login publicly. CAPTCHA-enabled password login needs an additional coordinated token/UI implementation; the current request accepts email/password only.

In URL configuration set Site URL to your exact planned application origin, and allow only the required local/preview/production redirect URLs. The implemented PKCE callback is `/api/auth/callback`; use exact origins, avoid broad wildcard production allowlists. Password login itself does not need a redirect. A PKCE link requires a verifier cookie from the initiating cookie-aware flow; a copied bare code is insufficient.

## 2. Review and apply migrations, only when authorized

On a fresh project, use the SQL editor as migration administrator, or your approved migration tool. Review/run each complete file, in order:

1. `supabase/migrations/202610110001_foundation.sql`
2. `supabase/migrations/202610110002_authenticated_rpcs.sql`

Each uses BEGIN/COMMIT. Record filename, checksum, target project and success before continuing; SQL-editor execution does not automatically create CLI migration history. Do not mix an unrecorded manual workflow with `supabase db push` or rerun these non-idempotent migrations. No official CSV seed is needed: public official reads use the bundled artifact. Private workspaces are created lazily by owner-derived RPCs.

After application, these **read-only administrator inspection queries** should show nine named domain tables, all RLS enabled, no client-role direct writes, SELECT-only scoped policies and five authenticated RPCs denied to anon. Administrative SQL bypasses RLS, so inspection alone does not prove user isolation.

```sql
select c.relname, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_write,
       has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as user_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
('workspaces','import_batches','feedback','feedback_patterns','annotations','issues','issue_evidence','actions','adaption_runs');

select tablename, cmd, roles, qual from pg_policies where schemaname='public';

select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('import_feedback_batch','read_feedback_batch','read_feedback_issue_batch','update_feedback_issue','create_feedback_action');
```

Expected: every `relrowsecurity=true`, every write privilege false; nine SELECT policies; RPC `prosecdef=true`, empty search_path, anon_execute=false and user_execute=true. Composite foreign keys, owner constraints and transactional payload validation remain enforced. Do not “fix” a missing grant by enabling unrestricted inserts or adding a service-role app client.

## 3. Configure local environment without sharing credentials

Copy `.env.example` to ignored `.env.local`. Preserve existing names:

| Variable | Value / purpose |
| --- | --- |
| `INSIGHTFLOW_DATA_MODE` | `official` for default public demo; UUID batch queries select private SQL independently |
| `SUPABASE_URL` | Your project's HTTPS API URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key; use `SUPABASE_ANON_KEY` only for a legacy anon-key project |
| `APP_ORIGIN` | Exact local dev origin, e.g. `http://localhost:3000`; exact HTTPS origin in production |
| `INSIGHTFLOW_WRITES_ENABLED` | `false` initially; `true` only for authorized private persistence tests after migrations |
| `SUPABASE_SERVICE_ROLE_KEY` | Leave blank; not used, and rejected if accidentally supplied as public client key |
| `ADAPTION_API_KEY` | Leave blank for the web application; separate local pilot workflow |

No `NEXT_PUBLIC_` secrets are needed for server password sign-in. The app does not load `.env.local` in plain Python; future authorized provider commands read process environment separately. Never paste keys/passwords into chat, commit them, or use shell commands that print all environment values.

Run `npm run dev` for local sign-in at the configured local origin; server cookies are secure in production and therefore need HTTPS outside dev. The integrated password form implements [the exact UI contract](AUTH_UI_HANDOFF.md). Use its Sign In control, then the server-discovered private batch selector. No NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or service-role credential is consumed by this flow. A REST access token held in localStorage does not establish this server session.

## 4. Authorized live sign-in and persistence acceptance

Only on the disposable project, after explicit authorization:

1. Sign in as user A through `/api/auth/sign-in` with same-origin JSON. GET `/api/auth/session` returns only verified UUID; refresh/reload retains cookies. User-provided IDs never authorize anything.
2. Enable writes and POST a small authored manual review. Verify GET /api/batches lists only A’s ready imports (B must have an empty or independently owned collection), then record the real returned `meta.batchId`; GET `/api/feedback?batchId=UUID` and dashboard/Data Lab use that selected batch. Default reads still show the official public dataset.
3. Import a tiny authored CSV (not competition data), retry identical bytes, verify the same batch and `idempotentReplay=true`. Invalid rows are disclosed; malformed/oversized CSV rolls back.
4. Select a returned private issue UUID, PATCH status/notes and POST an action. Reload/read back actual persisted values. Do not substitute importedAt for a complaint date.
5. In a separate browser session, sign in as user B. A's batches/issues must be inaccessible (404), cross-origin mutations must be 403, unsigned/expired/revoked sessions must be 401, authenticated public-demo mutations must be 403. Direct-table and anon RPC mutations must fail. Sign out A and verify private reads/writes now return 401. Revoked cookies are rechecked through `getUser` at each protected API boundary.
6. Save a private acceptance log containing statuses, row totals and opaque test IDs, never passwords/tokens. Local PGlite/Auth mocks are regression coverage, not evidence these live checks passed.

## 5. Configure and verify Vercel

Follow [production packaging](PRODUCTION_PACKAGING.md) and authorize hosting/data distribution separately. Add environment values above in the chosen Vercel Production/Preview scopes, using each exact `APP_ORIGIN`, and redeploy after changes. Use a stable chosen preview origin for Auth tests. Production should start with writes false; sign-in can be tested while mutations remain disabled. Enable writes only after the target migration/isolation checks pass. Service-role and Adaption keys are unnecessary for this web deployment.

Safe read-only smoke: set `SMOKE_BASE_URL` to the authorized preview, run `npm run smoke`, and inspect official counts/provenance on all six screens. Full `smoke:integration` includes unauthenticated write-denial attempts and browser-only test doubles; run on a disposable read-only preview. A successful local standalone test does not establish a remote Vercel function has the artifact.

## Recovery

If migration 1 fails, its transaction should roll back; inspect the actual schema/transaction result before reapplying. If migration 2 fails, migration 1 remains applied; resolve the specific failing statement and repeat only after confirming rollback. If connection loss makes COMMIT outcome uncertain, inspect objects/history first. On an existing project or partial manually applied schema, back up and produce a reviewed corrective migration; never drop customer data to force a clean run. No destructive rollback script is provided.

For missing RPC (503), verify the correct project and migration 2 rather than granting arbitrary privileges. For 401 verify configured key type, Auth provider, cookies and writes flag; for 403 verify exact Origin and ownership; do not weaken RLS. For deployment failure, keep writes false, roll traffic back to a previously verified build, fix environment/artifact input, rebuild and repeat smoke. Disable compromised access, revoke sessions/rotate affected secrets through the provider, and redeploy; never use a fixture fallback to mask a broken official release.
