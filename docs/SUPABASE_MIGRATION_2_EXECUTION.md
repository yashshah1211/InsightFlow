# Migration 2 execution and acceptance handoff

**Successfully applied and verified on the actual remote development database.** Final read-only verification completed on 2026-10-11 at 14:55:20 UTC. Private-data test writes have not run, and live two-user isolation is not yet proven.

| Item | Evidence |
| --- | --- |
| Project | `InsightFlow-dev` |
| Project ID | `dbacbcbglbqmqwxscesu` |
| Migration | `supabase/migrations/202610110002_authenticated_rpcs.sql` |
| SHA-256 | `707ffb735c28dd5440a3b41fd0284736834e65dc432e43424aa9756317ee1e7f` |
| Execution | Exactly one unmodified file through the existing Supabase Management API connection, including its BEGIN/COMMIT |
| Application writes | `INSIGHTFLOW_WRITES_ENABLED=false`, unchanged |
| Other migrations/data writes | None; no RPC was invoked and no test data was created |

## Preflight and remote verification

The exact project identity and healthy status were confirmed remotely. Migration 1's tables, columns, constraints, indexes, triggers, helpers, effective client table grants and SELECT policies matched the recorded foundation. The unrelated catalogs and complete Auth-user row fingerprint matched Migration 1 evidence. No Migration 2 function overloads, columns, index names or migration-history entries conflicted. The nine tables were empty, and neither client role inherited superuser or RLS-bypass roles.

After execution, all nine tables retain RLS and their original nine owner-scoped SELECT policies, including the curated demo exception. INSERT, UPDATE, DELETE and TRUNCATE are denied to both `anon` and `authenticated` through effective privilege checks. The schema now has 14 validated foreign keys, 24 indexes, six enabled triggers and the original two trigger helpers. Six additive columns, the `issue_batch_scope` composite foreign key and both unique indexes match the reviewed SQL. All nine tables still have zero rows.

The five RPCs have the following exact identity arguments:

| Function | Identity arguments |
| --- | --- |
| `import_feedback_batch` | `p_payload jsonb` |
| `read_feedback_batch` | `p_batch_id uuid` (default `NULL::uuid`) |
| `read_feedback_issue_batch` | `p_issue_id uuid` |
| `update_feedback_issue` | `p_issue_id uuid, p_patch jsonb` |
| `create_feedback_action` | `p_issue_id uuid, p_input jsonb` |

Each returns `jsonb`, uses PL/pgSQL, is owned by `postgres`, is SECURITY DEFINER and has exactly an empty search path. Every function body was compared with the reviewed migration. ACL expansion found EXECUTE for `postgres`, `authenticated` and the standard privileged `service_role`; none for PUBLIC or `anon`, and no client grant options. Effective checks include inherited grants. Client-role inheritance and all pre-existing public function permissions are unchanged. This verifies only the intended new RPC access, not a claim that authenticated users cannot execute any pre-existing PostgreSQL/Supabase function.

Before/after fingerprints match for unrelated schemas, relations, columns, constraints, indexes, triggers, policies, functions, roles, role memberships and extensions. Both Auth users remain present, and their complete row fingerprint is unchanged. No Auth settings, users or unrelated resources were edited.

The initial schema comparison reported a verifier mismatch: local PostgreSQL 18.3 catalogs table NOT NULL constraints separately, while remote PostgreSQL 17.11 does not. Column nullability already matched. The verifier was corrected locally to compare nullability exactly and every other constraint definition exactly, then all remote checks were repeated read-only. The initial result and explanation remain in the JSON evidence. No SQL was resubmitted or remotely changed. See [PostgreSQL 18 release notes](https://www.postgresql.org/docs/18/release-18.html).

Detailed evidence: [SUPABASE_MIGRATION_2_EXECUTION.json](SUPABASE_MIGRATION_2_EXECUTION.json). Guarded runner: [execute-authenticated-migration.mjs](../scripts/execute-authenticated-migration.mjs); `--verify-only` performs read-only remote inspection. Neither execution runner should be rerun to apply an already committed migration.

## Security limits and migration history

Authenticated callers now have database write RPC access even while the application writes flag is false. Direct RPC callers bypass the application's Origin checks, CSV parser and smaller HTTP upload limits. SQL enforces ownership and bounded validation, but does not reproduce all Zod/heuristic semantics. Keep this a controlled development project until live isolation tests pass. SECURITY DEFINER and `service_role` are privileged access paths; the app continues using a publishable/anon key, never a service-role client.

Both migrations were applied manually outside the CLI. Migration 1's recorded method is Management API rather than SQL Editor; both methods bypass CLI history. Remote inspection still finds no `supabase_migrations.schema_migrations` table. No history-repair operation ran. Before adopting CLI migrations, compare the real schema and records, then separately authorize recording `202610110001` and `202610110002` as already applied. Do not run unrestricted `supabase db push` or resubmit either SQL file. See [Supabase migration-history guidance](https://supabase.com/docs/guides/deployment/database-migrations).

If future checks fail, stop testing and preserve evidence. Keep application writes false; that flag alone cannot stop direct database RPC access. Propose separately authorized revocation of EXECUTE on the three mutation RPCs if containment is needed. Do not automatically drop objects, delete users/data, reset the project or alter privileges.

## Exact live two-user test procedure — pending separate approval

None of the following mutation tests has run. Approval must cover enabling local application writes, two tiny private imports, owned issue updates/actions, authentication session tests and negative write attempts. Use only this development project. Do not change Auth provider settings or deploy to production.

1. Privately set `INSIGHTFLOW_WRITES_ENABLED=true` in ignored `.env.local` after approval, confirm the configured APP_ORIGIN matches the actual local origin, and restart the development server. Use two independent browser profiles/contexts for A and B. Sign in through the app with the existing confirmed accounts, then refresh and verify GET `/api/auth/session` returns each profile's verified user ID. Never log passwords, cookies, access tokens or Authorization headers.
2. As A, POST multipart CSV to `/api/feedback/import`, file field `file`, filename `user-a.csv`, with these exact authored bytes:

   ```csv
   review,category
   The product is defective.,Product Feedback
   The product is defective.,Product Feedback
   ```

   Expect HTTP 200, recordCount 2, uniqueTextCount 1, repeatedRecordCount 1, rejectedCount 0 and idempotentReplay false. Privately record the actual `data.batchId` as A_BATCH. Retry the identical file: expect the same ID and idempotentReplay true, with no new batch or raw rows.
3. As B, import filename `user-b.csv` with these bytes:

   ```csv
   review,category
   Delivery was delayed.,Operational Issues
   ```

   Expect HTTP 200, recordCount 1, uniqueTextCount 1, repeatedRecordCount 0 and rejectedCount 0. Record the real returned ID as B_BATCH. B_BATCH must differ from A_BATCH. Imports must use the application boundary and its same-origin session cookies; do not call import RPC as administrator.
4. In both profiles, GET `/api/batches?page=1&pageSize=25`: A discovers only A_BATCH, B only B_BATCH. GET `/api/batches?batchId=OTHER_BATCH` returns HTTP 200 with empty `data.items`, not 404. Reload the selector: the same owned IDs must remain available. For each owned ID, GET `/api/dashboard?batchId=OWN_BATCH`, `/api/feedback?batchId=OWN_BATCH&view=records`, `/api/issues?batchId=OWN_BATCH`, `/api/data-lab?batchId=OWN_BATCH` and `/api/reports/export?format=csv&batchId=OWN_BATCH`; expect 200, correct private provenance and only that batch's feedback. Raw duplicates must remain; observedAt must be null. Default reads without a UUID still show the public official dataset.
5. Obtain the real private issue IDs from each owner's response as A_ISSUE/B_ISSUE. In the owner's profile, PATCH `/api/issues/OWN_ISSUE` with JSON `{"status":"investigating","notes":"Owner persistence test"}`, then POST `/api/issues/OWN_ISSUE/actions` with `{"description":"Investigate the cited complaint","notes":"Owner action test"}`. Expect 200. GET `/api/issues/OWN_ISSUE`, refresh and repeat the GET: status, notes and the returned action must persist. Repeat once for the other owner.
6. In A's profile request B's batch on dashboard/feedback/issues/Data Lab/export, and GET B_ISSUE: expect 404 with no private payload. PATCH B_ISSUE and POST its action endpoint with the same test bodies: expect 404 and no changes. Repeat B against A. Owners must then reread their own issues/actions and confirm rejected attempts changed nothing. Cross-origin application mutation requests with a foreign Origin must fail 403; public-demo issue mutation attempts must fail 403. Do not infer cross-user isolation merely from the selector or admin SQL.
7. Use a private local REST/SDK harness authenticated separately as A and B with the publishable key and user access tokens. Do not use a management token, service-role key or administrator SQL for these tests. Obtain workspace IDs privately from each owner's direct SELECT. Run the following matrix in both directions; retain only actor labels, statuses, opaque test IDs and row totals:

   | Actor/request | Expected result |
   | --- | --- |
   | Authenticated GET `/rest/v1/import_batches?id=eq.OTHER_BATCH&select=id` | 200, empty array |
   | Authenticated GET `/rest/v1/feedback?workspace_id=eq.OTHER_WORKSPACE&select=id` | 200, empty array |
   | Authenticated GET `/rest/v1/issues?id=eq.OTHER_ISSUE&select=id` | 200, empty array |
   | Authenticated GET `/rest/v1/actions?issue_id=eq.OTHER_ISSUE&select=id` | 200, empty array |
   | Authenticated POST `/rest/v1/rpc/read_feedback_batch`, `{"p_batch_id":"OTHER_BATCH"}` | Successful RPC response with null payload |
   | Authenticated POST `/rest/v1/rpc/read_feedback_issue_batch`, `{"p_issue_id":"OTHER_ISSUE"}` | Successful RPC response with null payload |
   | Authenticated POST `/rest/v1/rpc/update_feedback_issue`, `{"p_issue_id":"OTHER_ISSUE","p_patch":{"status":"resolved"}}` | Error, SQLSTATE P0002, no changes |
   | Authenticated POST `/rest/v1/rpc/create_feedback_action`, `{"p_issue_id":"OTHER_ISSUE","p_input":{"description":"Forbidden cross-user attempt"}}` | Error, SQLSTATE P0002, no changes |
   | Anonymous RPC calls to any of the five functions | Permission/auth error; no private response or mutation |
   | Authenticated/anonymous direct POST feedback, PATCH issues or DELETE actions using valid test shapes/IDs | Permission error; no mutation |

   Replace symbolic IDs with actual returned UUIDs. Repeat direct foreign-workspace SELECTs for workspaces, patterns, annotations, evidence and Adaption runs, using appropriate composite keys. Anonymous private-table reads return no private rows; deliberately curated demo rows may remain visible. TRUNCATE is not a REST operation: rely on the verified effective TRUNCATE privilege denial; do not attempt it through privileged SQL. Stop immediately if an unauthorized operation succeeds.
8. Sign A out through the app's same-origin POST `/api/auth/sign-out`. GET `/api/auth/session`, `/api/batches` and A's UUID-scoped reads must return 401 afterward; verify cached private screens/selector clear. A's sign-out must not sign B out. Test B equivalently.
9. Test token expiry accurately with a private local harness: hold an A access token/cookie jar only in memory, sign that session out to revoke refresh capability, wait past its actual JWT exp, then retry direct REST and private application requests with the retained stale credentials. Expect authentication denial/401 and no data changes. While refresh is valid, access-token expiry should refresh transparently; it is not evidence of an expired session. Supabase access JWTs from signed-out sessions can remain valid until exp, so do not assert immediate revocation of every retained JWT. No provider expiry settings should be changed for this test. See [Supabase sign-out semantics](https://supabase.com/docs/guides/auth/signout) and [session lifecycle](https://supabase.com/docs/guides/auth/sessions).
10. Save the credential-free live acceptance log, set application writes back to false and restart the app. Keep the two private batches as evidence unless cleanup is separately authorized. Inspect final row counts and unchanged foreign-owner issue/action state. Record actual outcomes; do not replace missing checks with local mocks.

For same-origin multipart execution from the signed-in app's browser console, use this after approval; it logs no credentials:

```js
const csv = 'review,category\nThe product is defective.,Product Feedback\nThe product is defective.,Product Feedback\n';
const form = new FormData();
form.append('file', new File([csv], 'user-a.csv', { type: 'text/csv' }));
const response = await fetch('/api/feedback/import', { method: 'POST', credentials: 'same-origin', body: form });
const result = await response.json(); // Inspect status and returned batch ID locally; never copy cookies/tokens.
```

For B substitute the one-row CSV and `user-b.csv`. For JSON mutations use `credentials:'same-origin'`, `Content-Type: application/json` and the bodies above. Do not manually set a multipart Content-Type boundary or invent batch/issue IDs.
