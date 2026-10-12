// Only the separately approved Migration 2. Never invokes a data-writing RPC.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { PGlite } from '@electric-sql/pglite';

const mode = process.argv[2];
if (!['--preflight', '--execute-approved-migration-2', '--verify-only'].includes(mode)) throw new Error('Use --preflight, --execute-approved-migration-2 or --verify-only; flags do not replace user authorization');
const verifyOnly = mode === '--verify-only';
const filename = 'supabase/migrations/202610110002_authenticated_rpcs.sql';
const checksumExpected = '707ffb735c28dd5440a3b41fd0284736834e65dc432e43424aa9756317ee1e7f';
const target = 'dbacbcbglbqmqwxscesu';
const auditPath = 'docs/SUPABASE_MIGRATION_2_EXECUTION.json';
const prior = JSON.parse(readFileSync('docs/SUPABASE_MIGRATION_1_EXECUTION.json', 'utf8'));
const previousAttempt = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, 'utf8')) : null;
if (verifyOnly && !previousAttempt?.verification) throw new Error('Read-only reverification requires an existing post-execution ledger');
if (!verifyOnly && previousAttempt && previousAttempt.execution !== 'preflight_passed') throw new Error('An execution or failed-preflight ledger exists; preserve evidence and inspect state without resubmitting');
const digest = value => createHash('sha256').update(value).digest('hex');
const bytes = readFileSync(filename);
const checksum = digest(bytes);
const sql = bytes.toString('utf8');
if (checksum !== checksumExpected || !/^begin;/i.test(sql) || !/commit;\s*$/i.test(sql)) throw new Error('Approved file checksum or transaction guard failed');
if (prior.execution !== 'applied_and_verified_remote' || prior.targetReference !== target || digest(readFileSync(prior.filename)) !== prior.checksum) throw new Error('Migration 1 evidence guard failed');

const config = { ...process.env };
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && config[m[1]] === undefined) config[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if ((config.SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1] !== target || config.INSIGHTFLOW_WRITES_ENABLED !== 'false' || !config.SUPABASE_ACCESS_TOKEN) throw new Error('Target, disabled-writes or existing credential guard failed');
const root = 'https://api.supabase.com/v1/projects/' + target;
async function request(url, options = {}) {
  const response = await globalThis.fetch(url, { ...options, headers: { Authorization: 'Bearer ' + config.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, signal: globalThis.AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Management API request failed (HTTP ' + response.status + '); no automatic retry');
  return response.json();
}
const query = (text, readOnly = true) => request(root + '/database/query', { method: 'POST', body: JSON.stringify({ query: text, read_only: readOnly }) });
const project = await request(root);
if (project.id !== target || project.name !== 'InsightFlow-dev' || project.status !== 'ACTIVE_HEALTHY') throw new Error('Development project identity or health mismatch');
const audit = verifyOnly ? { ...previousAttempt } : { filename, checksum, targetProject: project.name, targetReference: target, execution: 'preflighting', startedAt: new Date().toISOString(), method: 'One unmodified SQL file via Supabase Management API with intended BEGIN/COMMIT', migration1Method: prior.history, applicationWritesEnabled: false };
if (verifyOnly) audit.initialVerification ??= { execution: previousAttempt.execution, completedAt: previousAttempt.completedAt, checks: previousAttempt.checks };
const save = () => writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
const tables = prior.verification.tables.map(t => t.name);
const tableSql = tables.map(t => `'${t}'`).join(',');
const helperSql = "'enforce_workspace_owner','touch_updated_at'";
const expectedArgs = {
  import_feedback_batch: 'p_payload jsonb', read_feedback_batch: 'p_batch_id uuid',
  read_feedback_issue_batch: 'p_issue_id uuid', update_feedback_issue: 'p_issue_id uuid, p_patch jsonb',
  create_feedback_action: 'p_issue_id uuid, p_input jsonb',
};
const rpcSql = Object.keys(expectedArgs).map(name => `'${name}'`).join(',');
const normalized = value => {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
  return value;
};
const same = (a, b) => JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));

// Reuse only the read-only SQL template from the recorded Migration 1 runner.
// It is read as text, never imported/evaluated or executed as a program.
const legacy = readFileSync('scripts/execute-foundation-migration.mjs', 'utf8');
const outsideTemplate = legacy.match(/const outsideCatalog = `([\s\S]*?)`;/)?.[1];
if (!outsideTemplate) throw new Error('Recorded catalog inspection template unavailable');
const outsideSql = excluded => outsideTemplate.replaceAll('${tableSql}', tableSql).replaceAll('${helperSql}', excluded);
const outsideBefore = verifyOnly ? audit.outsideBefore : (await query(outsideSql(helperSql)))[0].result;
// Auth row changes since the previous migration are recorded separately: normal login can update timestamps.
// Any difference here is treated as a blocker rather than silently attributed to login.
audit.sinceMigration1 = Object.fromEntries(Object.keys(prior.outsideAfter).map(key => [key, outsideBefore[key] === prior.outsideAfter[key]]));
audit.outsideBefore = outsideBefore;

const catalogSql = `select jsonb_build_object(
 'serverVersionNum',current_setting('server_version_num')::integer,
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anonSelect',pg_catalog.has_table_privilege('anon',c.oid,'SELECT'),'userSelect',pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT'),'anonWrite',pg_catalog.has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),'userWrite',pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in (${tableSql})),
 'columns',(select jsonb_agg(jsonb_build_object('table',c.table_name,'name',c.column_name,'position',c.ordinal_position,'type',c.udt_name,'nullable',c.is_nullable,'default',c.column_default) order by c.table_name,c.ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name in (${tableSql})),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'type',k.contype,'validated',k.convalidated,'definition',pg_catalog.pg_get_constraintdef(k.oid,true)) order by c.relname,k.conname) from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql})),
 'indexes',(select jsonb_agg(to_jsonb(i) order by i.tablename,i.indexname) from pg_catalog.pg_indexes i where i.schemaname='public' and i.tablename in (${tableSql})),
 'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_catalog.pg_get_triggerdef(t.oid,true)) order by c.relname,t.tgname) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql}) and not t.tgisinternal),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_catalog.pg_policies p where p.schemaname='public' and p.tablename in (${tableSql})),
 'helpers',(select jsonb_agg(jsonb_build_object('name',p.proname,'securityDefiner',p.prosecdef,'configuration',p.proconfig,'owner',pg_catalog.pg_get_userbyid(p.proowner),'definition',pg_catalog.pg_get_functiondef(p.oid)) order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${helperSql})),
 'rpcs',coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'defaults',pg_catalog.pg_get_expr(p.proargdefaults,0),'returns',pg_catalog.pg_get_function_result(p.oid),'owner',pg_catalog.pg_get_userbyid(p.proowner),'language',(select l.lanname from pg_catalog.pg_language l where l.oid=p.prolang),'securityDefiner',p.prosecdef,'configuration',p.proconfig,'source',p.prosrc,'anonExecute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),'userExecute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),'publicExecute',exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE'),'acl',(select jsonb_agg(jsonb_build_object('grantee',case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,'privilege',acl.privilege_type,'grantable',acl.is_grantable) order by acl.grantee,acl.privilege_type) from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl)) order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${rpcSql})),'[]'::jsonb),
 'effectivePublicFunctionAccess',(select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'anonExecute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),'userExecute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
 'inheritedClientRoles',(select jsonb_agg(jsonb_build_object('role',r.rolname,'anonInherits',pg_catalog.pg_has_role('anon',r.oid,'USAGE'),'userInherits',pg_catalog.pg_has_role('authenticated',r.oid,'USAGE'),'superuser',r.rolsuper,'bypassRls',r.rolbypassrls) order by r.rolname) from pg_catalog.pg_roles r where pg_catalog.pg_has_role('anon',r.oid,'USAGE') or pg_catalog.pg_has_role('authenticated',r.oid,'USAGE')),
 'migration2Indexes',coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('private_workspace_owner_unique','issue_batch_key_unique')),'[]'::jsonb),
 'historyExists',pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null,
 'rowCounts',jsonb_build_object(${tables.map(t => `'${t}',(select count(*) from public.${t})`).join(',')})
) as result`;
const before = verifyOnly ? audit.preflight : (await query(catalogSql))[0].result;
audit.preflight = before;
const baseKeys = ['tables', 'constraints', 'indexes', 'triggers', 'policies', 'helpers'];
const foundationChecks = Object.fromEntries(baseKeys.map(key => [key, same(before[key], prior.verification[key])]));
// Local PostgreSQL generates expected column metadata from the reviewed file; this is only a comparison oracle.
const local = new PGlite();
let expectedBefore, expectedAfter;
try {
  await local.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  await local.exec(readFileSync(prior.filename, 'utf8'));
  expectedBefore = (await local.query(catalogSql)).rows[0].result;
  await local.exec(sql);
  expectedAfter = (await local.query(catalogSql)).rows[0].result;
} finally { await local.close(); }
foundationChecks.columns = same(before.columns, expectedBefore.columns);
audit.preflightChecks = {
  priorCatalogAndAuthIntact: Object.values(audit.sinceMigration1).every(Boolean),
  foundationIntact: Object.values(foundationChecks).every(Boolean),
  noMigration2Objects: before.rpcs.length === 0 && before.migration2Indexes.length === 0,
  emptyApplicationTables: Object.values(before.rowCounts).every(count => count === 0),
  noInheritedPrivilegedClientRole: before.inheritedClientRoles.every(r => !r.superuser && !r.bypassRls),
  historyUnchanged: before.historyExists === prior.preflight.historyExists,
};
audit.foundationChecks = foundationChecks;
if (before.historyExists) audit.historyVersionsBefore = await query('select version from supabase_migrations.schema_migrations order by version');
if ((audit.historyVersionsBefore || []).some(row => row.version === '202610110002')) audit.preflightChecks.noMigration2Objects = false;
if (!verifyOnly) audit.outsideBeforeExcludingNewRpcs = (await query(outsideSql(rpcSql)))[0].result;
if (!Object.values(audit.preflightChecks).every(Boolean)) {
  audit.execution = 'preflight_failed_no_migration_submitted'; save();
  console.log(JSON.stringify({ execution: audit.execution, preflightChecks: audit.preflightChecks, foundationChecks, sinceMigration1: audit.sinceMigration1 }));
  process.exit(1);
}
if (!verifyOnly) { audit.execution = 'preflight_passed'; save(); }
console.log(JSON.stringify({ targetProject: project.name, targetReference: target, filename, checksum, preflightChecks: audit.preflightChecks, verifyOnly }));
if (mode === '--preflight') process.exit(0);

if (!verifyOnly) {
  audit.execution = 'submitting'; save();
  try {
    await query(sql, false); // Sole non-read-only request: exact approved file, no appended SQL.
    audit.execution = 'management_api_success'; save();
  } catch {
    audit.execution = 'error_or_uncertain_commit'; save();
    throw new Error('Migration request failed or COMMIT outcome is uncertain. Preserve evidence and inspect remote state; do not retry or alter grants automatically.');
  }
}
const after = (await query(catalogSql))[0].result;
audit.verification = after;
audit.outsideAfterExcludingNewRpcs = (await query(outsideSql(rpcSql)))[0].result;
audit.unrelatedChecks = Object.fromEntries(Object.keys(audit.outsideBeforeExcludingNewRpcs).map(key => [key, audit.outsideBeforeExcludingNewRpcs[key] === audit.outsideAfterExcludingNewRpcs[key]]));
const sourceMatches = Object.fromEntries(after.rpcs.map(rpc => {
  const expected = expectedAfter.rpcs.find(r => r.name === rpc.name && r.arguments === rpc.arguments);
  return [rpc.name, Boolean(expected && rpc.source === expected.source)];
}));
audit.rpcSourceChecks = sourceMatches;
const unchangedKeys = ['tables', 'policies', 'triggers', 'helpers', 'inheritedClientRoles'];
const shapeKeys = ['columns', 'constraints', 'indexes', 'migration2Indexes'];
// PostgreSQL 18 catalogs NOT NULL as contype='n'; earlier versions expose it only
// through column nullability. Compare nullability exactly above and normalize this
// representation difference, preserving every other constraint definition.
const comparableConstraints = list => list.filter(constraint => constraint.type !== 'n');
audit.schemaComparison = Object.fromEntries(shapeKeys.map(key => [key, same(key === 'constraints' ? comparableConstraints(after[key]) : after[key], key === 'constraints' ? comparableConstraints(expectedAfter[key]) : expectedAfter[key])]));
audit.comparisonVersions = { remote: after.serverVersionNum, localOracle: expectedAfter.serverVersionNum };
if (verifyOnly) audit.verificationNote = 'Initial comparison incorrectly expected PostgreSQL 18 NOT NULL pg_constraint rows on the older remote PostgreSQL server. Read-only reverification compares column nullability exactly and all other constraint definitions exactly. No remote SQL, permissions or objects were changed during diagnosis/reverification.';
audit.checks = {
  foundationRlsPoliciesGrantsAndTriggersPreserved: unchangedKeys.every(key => same(after[key], before[key])),
  migration2SchemaExactlyMatchesReviewedFile: Object.values(audit.schemaComparison).every(Boolean),
  fiveIntendedRpcs: after.rpcs.length === 5 && after.rpcs.every(rpc => rpc.arguments === expectedArgs[rpc.name] && rpc.returns === 'jsonb' && rpc.language === 'plpgsql' && rpc.owner === 'postgres' && rpc.securityDefiner && same(rpc.configuration, ['search_path=""'])),
  exactRpcBodies: after.rpcs.length === 5 && Object.values(sourceMatches).every(Boolean),
  intendedRpcDefaults: after.rpcs.every(rpc => rpc.name === 'read_feedback_batch' ? rpc.defaults === 'NULL::uuid' : rpc.defaults === null),
  effectiveRpcGrants: after.rpcs.length === 5 && after.rpcs.every(rpc => !rpc.anonExecute && !rpc.publicExecute && rpc.userExecute && rpc.acl.every(entry => entry.privilege === 'EXECUTE' && ['postgres', 'authenticated', 'service_role'].includes(entry.grantee) && (entry.grantee === 'postgres' || !entry.grantable))),
  noOtherPublicFunctionAccessChanges: same(before.effectivePublicFunctionAccess, after.effectivePublicFunctionAccess.filter(rpc => !Object.hasOwn(expectedArgs, rpc.name))),
  directClientWritesDenied: after.tables.length === 9 && after.tables.every(t => t.rls && !t.anonWrite && !t.userWrite),
  nineTablesRemainEmpty: after.tables.length === 9 && Object.values(after.rowCounts).every(count => count === 0),
  authAndUnrelatedCatalogUnchanged: Object.values(audit.unrelatedChecks).every(Boolean),
  historyUnchanged: after.historyExists === before.historyExists,
  applicationWritesDisabled: config.INSIGHTFLOW_WRITES_ENABLED === 'false',
};
audit.history = 'Migrations 1 and 2 were manually applied via Management API, outside the CLI. No CLI migration-history table/entry exists. Neither migration may be rerun; reconcile verified schema/history before any CLI push. No history repair was executed.';
audit.completedAt = new Date().toISOString();
audit.execution = Object.values(audit.checks).every(Boolean) ? 'applied_and_verified_remote' : 'applied_verification_failed';
// Persist hashes instead of body copies in the RPC evidence; expected source equality was checked above.
for (const rpc of audit.verification.rpcs) { rpc.sourceSha256 = digest(rpc.source); delete rpc.source; }
save();
console.log(JSON.stringify({ execution: audit.execution, checks: audit.checks, authUserCount: audit.outsideAfterExcludingNewRpcs.authUserCount, rpcGrants: after.rpcs.map(rpc => ({ name: rpc.name, arguments: rpc.arguments, acl: rpc.acl })), auditPath }));
if (audit.execution !== 'applied_and_verified_remote') process.exitCode = 1;
