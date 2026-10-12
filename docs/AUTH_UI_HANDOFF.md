# Authentication handoff for Antigravity — additive auth protocol

Phase 5B integrated Antigravity Phase 5A and minimally repaired session/discovery boundaries under the user-authorized ownership exception. The password UI is implemented. Domain schemas in `src/lib/contracts/index.ts` and API v1.0.0 are unchanged. New auth schemas are in `src/lib/contracts/auth.ts`; they use a separate `auth-1.0.0` envelope because an auth session has no feedback batch/provenance.

## Server interface

| Route | Input | Success | Failure |
| --- | --- | --- | --- |
| POST `/api/auth/sign-in` | JSON `{email,password}`; strict, email <=254 chars, password 1–1024 chars | 200 `{data:{userId:UUID},meta:{contractVersion:"auth-1.0.0"}}`; Supabase SSR cookies | 400 invalid input, 401 invalid/unconfigured Auth, 403 foreign/missing Origin, 503 missing production APP_ORIGIN |
| GET `/api/auth/session` | Cookie session | Same verified UUID envelope | 401 missing/expired/revoked/unconfigured session |
| POST `/api/auth/sign-out` | Same-origin request, cookie session | Same envelope with `userId:null`; local session ended | 401 unsigned, 403 foreign/missing Origin, 503 provider failure |
| GET `/api/auth/callback?code=...` | Exactly one bounded PKCE code; verifier cookie established by cookie-aware Supabase auth | 303 fixed relative redirect `/`; refreshed cookies | 400 invalid/duplicate/unknown query, 401 expired code or verification failure |

Failures keep the frozen `{error:{code,message}}` shape. Tokens, email addresses, passwords and provider details are never returned. No account-creation/password-reset endpoint exists. Password sign-in is sufficient for two administrator-created confirmed email users; OAuth/magic-link initiation is a future UI-owned flow. PKCE callback does not accept a `next` redirect parameter. Do not invent a sign-up flow around it.

Session and verifier cookies are HTTP-only, sameSite=lax, path=/ and secure in production; browser Supabase clients cannot read them. OAuth/OTP initiation must therefore remain server-side or explicitly redesign that cookie contract in a later coordinated phase. All requests are same-origin `fetch` with `credentials:'same-origin'` and no browser token handling. Sign-in/out require Origin; browsers set it on POST. Do not log/store passwords or attach them to analytics. Success responses are private/no-store; failures are no-store. Auth routes work independently of `INSIGHTFLOW_WRITES_ENABLED`; enabling a session does not enable mutations. Mutation authorization still uses verified `getUser` and owner-derived SQL RPCs. Never use `getSession` as proof of access.

## UI implementation contract

1. Add a small sign-in screen/form and signed-in user indicator/sign-out control while preserving the existing design. POST SignInRequest; parse AuthSessionResponse; clear the password field after submission; show the returned sanitized error. Disable repeat submissions while pending. Refresh GET session on reload; 401 means signed out. Do not show success after an error.
2. The password flow uses server environment names already in `.env.example`; no `NEXT_PUBLIC_` configuration or browser Supabase client is required. For future OAuth/OTP, add a coordinated server initiation route that sets the HTTP-only PKCE verifier cookie; the current password flow has no browser Supabase client or public environment-variable requirement. The callback URL is `/api/auth/callback`. Never expose service-role or Adaption keys.
3. Add an explicit public-demo/private-batch selector. After a successful manual/import write, retain **the returned** `meta.batchId` and select it. Imports can return the same batch for a retry; manual submissions are separate batches. GET /api/batches uses a separate batches-1.0.0 schema; see BATCH_API_CONTRACT.md. Discover existing batches from the server, refresh after writes and reauthorize stored IDs before restoring them. Stored IDs grant no permission. No manual UUID entry is needed.
4. Pass selected `batchId` to dashboard, feedback, issues, decisions, Data Lab and CSV export. Include it in evidence/deep-link navigation. Changing batch resets filters/page/selected issue and discards responses from the prior scope. Do not reuse public default totals for a private response. UUID issue details may infer the private batch server-side.
5. Preserve public access without sign-in. Public official patterns are read-only even when authenticated. Distinguish 401 (sign in/feature disabled), 403 (forbidden), 404 (unknown/inaccessible private resource); never infer a different owner's existence. Keep original provenance and coverage states visible.
6. Acceptance after authorized live setup: two users, sign-in/reload/sign-out, manual add, import/retry, private selection across all six screens, status/action persistence, cross-owner denial, expired/revoked cookies and foreign Origin denial. Current tests verify mocked Auth + local SQL boundaries; no live account result is claimed.

Deployment detail: Vercel's 4.5 MB request cap is smaller than the frozen backend 5 MiB CSV limit. Use a 4 MiB UI ceiling for Vercel and handle non-JSON platform failures without a false success state. Keep the backend contract unchanged; coordinate broader limits/pagination only if larger private datasets are needed. See PRODUCTION_PACKAGING.md.

Sources checked 2026-10-11: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [email/password authentication](https://supabase.com/docs/guides/auth/passwords).
