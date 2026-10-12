// One approved development migration only. Never logs credentials or uses db push.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const filename = 'supabase/migrations/202610110001_foundation.sql';
const expectedChecksum = '2a29d7860a7a27bd3297ad69e31f1fd735a795b80091868ade930f36d0f32026';
const targetRef = 'dbacbcbglbqmqwxscesu';
const tables = ['workspaces', 'import_batches', 'feedback_patterns', 'feedback', 'annotations', 'issues', 'issue_evidence', 'actions', 'adaption_runs'];
const helpers = ['enforce_workspace_owner', 'touch_updated_at'];
const rpcs = ['import_feedback_batch', 'read_feedback_batch', 'read_feedback_issue_batch', 'update_feedback_issue', 'create_feedback_action'];
const tableSql = tables.map(name => `'${name}'`).join(',');
const helperSql = helpers.map(name => `'${name}'`).join(',');
const rpcSql = rpcs.map(name => `'${name}'`).join(',');
const indexNames = ['feedback_batch_category_idx', 'feedback_hash_idx', 'feedback_date_idx', 'issues_workspace_status_idx', 'issue_evidence_pattern_idx', 'actions_issue_idx', 'adaption_batch_idx', 'workspace_owner_idx'];
const values = { ...process.env };
if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match && values[match[1]] === undefined) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const configuredRef = (values.SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
if (configuredRef !== targetRef || values.INSIGHTFLOW_WRITES_ENABLED !== 'false' || !values.SUPABASE_ACCESS_TOKEN) {
  throw new Error('Target, disabled-writes or existing management credential guard failed');
}
const contents = readFileSync(filename);
const checksum = createHash('sha256').update(contents).digest('hex');
if (checksum !== expectedChecksum) throw new Error('Approved migration checksum changed');
const migration = contents.toString('utf8');
if (!/^--[^\n]*\r?\nbegin;/i.test(migration) || !/commit;\s*$/i.test(migration)) throw new Error('Transaction guard failed');
const headers = { Authorization: 'Bearer ' + values.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' };
const root = 'https://api.supabase.com/v1/projects/' + targetRef;
async function request(url, options = {}) {
  const response = await globalThis.fetch(url, { ...options, headers, signal: globalThis.AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Management API request failed (HTTP ' + response.status + ')');
  return response.json();
}
async function query(sql, readOnly = true) {
  return request(root + '/database/query', { method: 'POST', body: JSON.stringify({ query: sql, read_only: readOnly }) });
}
const project = await request(root);
if (project.id !== targetRef || project.name.toLowerCase() !== 'insightflow-dev' || project.status !== 'ACTIVE_HEALTHY') {
  throw new Error('Approved development project identity or health check failed');
}
const audit = { filename, checksum, targetProject: project.name, targetReference: targetRef, startedAt: new Date().toISOString(), execution: 'not_started', history: 'Manual single-file Management API execution; no CLI migration-history entry is created.' };
const auditPath = 'docs/SUPABASE_MIGRATION_1_EXECUTION.json';
if (existsSync(auditPath)) throw new Error('Execution ledger already exists; preserve it and do not rerun this migration');
const save = () => writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');

const preflight = (await query(`select jsonb_build_object(
  'relations',coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql},${indexNames.map(name => `'${name}'`).join(',')})),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${helperSql},${rpcSql})),'[]'::jsonb),
  'types',coalesce((select jsonb_agg(t.typname order by t.typname) from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname in (${tableSql})),'[]'::jsonb),
  'historyExists',pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null
) as result`))[0].result;
audit.preflight = preflight;
if (preflight.historyExists) {
  audit.existingHistoryVersions = await query("select version from supabase_migrations.schema_migrations order by version");
}
save();
if (preflight.relations.length || preflight.functions.length || preflight.types.length || (audit.existingHistoryVersions || []).some(row => row.version === '202610110001')) {
  throw new Error('Existing or conflicting migration objects/history detected; no migration submitted');
}

// Hash complete catalog definitions on the server; no user rows or function bodies are returned.
const outsideCatalog = `select jsonb_build_object(
 'schemas',(select md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,n.nspowner,n.nspacl) order by n.nspname),'[]'::jsonb)::text) from pg_catalog.pg_namespace n where n.nspname !~ '^pg_(toast_)?temp_'),
 'relations',(select md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) order by n.nspname,c.relname),'[]'::jsonb)::text) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','f','S') and n.nspname !~ '^pg_(toast_)?temp_' and not(n.nspname='public' and c.relname in (${tableSql}))),
 'columns',(select md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.attnum,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum),'[]'::jsonb)::text) from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','f','S') and n.nspname !~ '^pg_(toast_)?temp_' and not(n.nspname='public' and c.relname in (${tableSql}))),
 'constraints',(select md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,k.contype,k.convalidated,pg_catalog.pg_get_constraintdef(k.oid,true)) order by n.nspname,c.relname,k.conname),'[]'::jsonb)::text) from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where not(n.nspname='public' and c.relname in (${tableSql}))),
 'indexes',(select md5(coalesce(jsonb_agg(jsonb_build_array(i.schemaname,i.tablename,i.indexname,i.indexdef) order by i.schemaname,i.tablename,i.indexname),'[]'::jsonb)::text) from pg_catalog.pg_indexes i where i.schemaname !~ '^pg_(toast_)?temp_' and not(i.schemaname='public' and i.tablename in (${tableSql}))),
 'triggers',(select md5(coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname),'[]'::jsonb)::text) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and not(n.nspname='public' and c.relname in (${tableSql}))),
 'policies',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname),'[]'::jsonb)::text) from pg_catalog.pg_policies p where not(p.schemaname='public' and p.tablename in (${tableSql}))),
 'functions',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]'::jsonb)::text) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_(toast_)?temp_' and not(n.nspname='public' and p.proname in (${helperSql}))),
 'roles',(select md5(coalesce(jsonb_agg(jsonb_build_array(r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls) order by r.rolname),'[]'::jsonb)::text) from pg_catalog.pg_roles r),
 'roleMemberships',(select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]'::jsonb)::text) from pg_catalog.pg_auth_members m),
 'extensions',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.extname),'[]'::jsonb)::text) from pg_catalog.pg_extension e),
 'authUserCount',(select count(*) from auth.users),
 'authUsersFingerprint',(select md5(coalesce(jsonb_agg(md5(to_jsonb(u)::text) order by u.id),'[]'::jsonb)::text) from auth.users u)
) as result`;
audit.outsideBefore = (await query(outsideCatalog))[0].result;
audit.execution = 'submitting';
save();
console.log(JSON.stringify({ approvedTarget: project.name, targetReference: targetRef, checksum, conflicts: false, submittingOnly: filename }));
try {
  // The sole non-read-only request is the unmodified approved file, with its own BEGIN/COMMIT.
  await query(migration, false);
  audit.execution = 'management_api_success';
} catch {
  audit.execution = 'error_or_uncertain_commit';
  save();
  throw new Error('Migration request failed or COMMIT outcome is uncertain. Do not retry; inspect remote state first.');
}
save();

const verification = (await query(`select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anonSelect',pg_catalog.has_table_privilege('anon',c.oid,'SELECT'),'userSelect',pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT'),'anonWrite',pg_catalog.has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),'userWrite',pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in (${tableSql})),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'type',k.contype,'validated',k.convalidated,'definition',pg_catalog.pg_get_constraintdef(k.oid,true)) order by c.relname,k.conname) from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql})),
 'indexes',(select jsonb_agg(to_jsonb(i) order by i.tablename,i.indexname) from pg_catalog.pg_indexes i where i.schemaname='public' and i.tablename in (${tableSql})),
 'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_catalog.pg_get_triggerdef(t.oid,true)) order by c.relname,t.tgname) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql}) and not t.tgisinternal),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_catalog.pg_policies p where p.schemaname='public' and p.tablename in (${tableSql})),
 'helpers',(select jsonb_agg(jsonb_build_object('name',p.proname,'securityDefiner',p.prosecdef,'configuration',p.proconfig,'owner',pg_catalog.pg_get_userbyid(p.proowner),'definition',pg_catalog.pg_get_functiondef(p.oid)) order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${helperSql})),
 'migration2Functions',(select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${rpcSql})),
 'migration2Columns',(select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name in (${tableSql}) and c.column_name in ('contract_json','rejected_rows','issue_key')),
 'rowCounts',jsonb_build_object(${tables.map(name => `'${name}',(select count(*) from public.${name})`).join(',')})
) as result`))[0].result;
audit.verification = verification;
audit.outsideAfter = (await query(outsideCatalog))[0].result;
audit.unrelatedCatalogChecks = Object.fromEntries(Object.keys(audit.outsideBefore).map(key => [key, audit.outsideBefore[key] === audit.outsideAfter[key]]));
const checks = {
  nineTables: verification.tables?.length === 9,
  rlsAndReadOnlyGrants: verification.tables?.every(t => t.rls && t.anonSelect && t.userSelect && !t.anonWrite && !t.userWrite),
  thirteenForeignKeys: verification.constraints?.filter(c => c.type === 'f').length === 13,
  ninePrimaryKeys: verification.constraints?.filter(c => c.type === 'p').length === 9,
  fiveUniqueConstraints: verification.constraints?.filter(c => c.type === 'u').length === 5,
  validatedConstraints: verification.constraints?.every(c => c.validated),
  twentyTwoIndexes: verification.indexes?.length === 22 && indexNames.every(name => verification.indexes.some(i => i.indexname === name)),
  sixEnabledTriggers: verification.triggers?.length === 6 && verification.triggers.every(t => t.enabled === 'O'),
  nineSelectPolicies: verification.policies?.length === 9 && verification.policies.every(p => p.cmd === 'SELECT' && p.roles.includes('anon') && p.roles.includes('authenticated')),
  twoInvokerHelpers: verification.helpers?.length === 2 && verification.helpers.every(p => !p.securityDefiner && p.configuration?.includes('search_path=""')),
  noMigration2Objects: verification.migration2Functions === 0 && verification.migration2Columns === 0,
  noSeededRows: Object.values(verification.rowCounts).every(count => count === 0),
  unrelatedCatalogAndAuthUnchanged: Object.values(audit.unrelatedCatalogChecks).every(Boolean),
  applicationWritesDisabled: values.INSIGHTFLOW_WRITES_ENABLED === 'false',
};
audit.checks = checks;
audit.completedAt = new Date().toISOString();
audit.execution = Object.values(checks).every(Boolean) ? 'applied_and_verified_remote' : 'applied_verification_failed';
save();
console.log(JSON.stringify({ execution: audit.execution, checks, authUserCount: audit.outsideAfter.authUserCount, auditPath }));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
