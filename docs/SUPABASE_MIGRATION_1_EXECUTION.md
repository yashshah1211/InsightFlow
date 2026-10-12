# Migration 1 execution record

Applied and verified on the actual remote development database on 2026-10-11 at 14:34:18 UTC.

| Item | Recorded value |
| --- | --- |
| Project | `InsightFlow-dev` |
| Project reference | `dbacbcbglbqmqwxscesu` |
| Migration | `supabase/migrations/202610110001_foundation.sql` |
| SHA-256 | `2a29d7860a7a27bd3297ad69e31f1fd735a795b80091868ade930f36d0f32026` |
| Method | Supabase Management API, one unmodified SQL file with its own BEGIN/COMMIT |
| Execution | Successful; independently inspected remote catalogs after execution |
| Application writes | `INSIGHTFLOW_WRITES_ENABLED=false` |
| Migration 2 | Not submitted; its functions and additive columns are absent |

Preflight found no conflicting InsightFlow relations, function names or table types, no existing public tables, and no `supabase_migrations.schema_migrations` table. Two Auth users existed.

Remote verification passed: nine RLS-enabled tables, 13 validated foreign keys, nine primary keys, five unique constraints, 22 indexes (eight explicitly created plus constraint indexes), six enabled triggers, nine SELECT policies, and two security-invoker trigger helpers owned by `postgres` with empty search paths. Both client roles have SELECT and no INSERT/UPDATE/DELETE/TRUNCATE privileges on the nine tables. Their SELECT policies are owner-scoped with a public-demo exception. All nine tables contain zero rows.

Before/after fingerprints match for unrelated schemas, relation definitions, columns, constraints, indexes, triggers, policies, functions, roles, role memberships and extensions. Auth user count remains two, and the complete Auth-user row fingerprint is unchanged. No data was seeded, deleted, reset or overwritten. These catalog checks do not establish live two-user isolation with private data; that acceptance test remains pending separately authorized test writes.

The detailed, credential-free verification evidence is in [SUPABASE_MIGRATION_1_EXECUTION.json](SUPABASE_MIGRATION_1_EXECUTION.json). The guarded single-file runner is [execute-foundation-migration.mjs](../scripts/execute-foundation-migration.mjs); do not rerun it against this already-migrated database. It refuses detected existing/conflicting objects rather than replacing them.

This manual Management API execution creates no CLI migration-history entry. The execution record is the application ledger for this step. Before adopting CLI migrations, reconcile the actual schema and reviewed history, then record version `202610110001` as applied using an explicitly authorized history-repair operation. Do not use unrestricted `supabase db push`, recreate these objects, or mark Migration 2 applied. See the [official migration-history guidance](https://supabase.com/docs/guides/deployment/database-migrations).

Next: obtain explicit authorization for Migration 2, including its authenticated write-RPC grants. Keep application writes false through migration and catalog verification. Enable private test writes and conduct real two-user isolation only when separately approved.
