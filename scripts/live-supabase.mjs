// Real development-project acceptance. This creates private data; never run without authorization.
// No screenshots, traces, credential logs, privileged user operations or automatic cleanup.
import process from 'node:process';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as contracts from '../src/lib/contracts/index.ts';
import { BatchesResponse } from '../src/lib/contracts/batches.ts';
import { verifyRejectedImports } from './live-rpc-checks.mjs';

const target = 'dbacbcbglbqmqwxscesu';
const envPath = '.env.local';
const config = { ...process.env };
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) config[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
assert(process.argv.includes('--approved-dev-writes'), 'Explicit approved-dev-writes argument required; this is not authorization by itself');
assert.equal(new URL(config.SUPABASE_URL).hostname, target + '.supabase.co', 'Development project guard');
assert.equal(config.INSIGHTFLOW_WRITES_ENABLED, 'false', 'Begin with writes disabled');
for (const name of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'LIVE_TEST_USER_A_EMAIL', 'LIVE_TEST_USER_A_PASSWORD', 'LIVE_TEST_USER_B_EMAIL', 'LIVE_TEST_USER_B_PASSWORD']) assert(config[name], 'Required private configuration absent');
assert.notEqual(config.LIVE_TEST_USER_A_EMAIL, config.LIVE_TEST_USER_B_EMAIL);
const output = 'docs/PHASE6A_LIVE_SUPABASE.json';
const prior = process.argv.includes('--resume') ? JSON.parse(readFileSync(output, 'utf8')) : null;
if (prior) { assert.equal(prior.targetReference, target); assert.equal(prior.status, 'failed'); }
else if (existsSync(output)) assert.equal(JSON.parse(readFileSync(output, 'utf8')).batches.length, 0, 'Preserve the existing run ledger; no fresh run over recorded private batches');
const securityOnly = process.argv.includes('--resume-security');
if (securityOnly) assert(prior?.batches.length === 3 && prior.batches.filter(b => b.actionId).length === 2, 'Security resume requires this recorded completed persistence run');
const runId = prior?.runId ?? 'phase6a-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID().slice(0, 8);
const evidence = { runId, targetProject: 'InsightFlow-dev', targetReference: target, startedAt: prior?.startedAt ?? new Date().toISOString(), status: 'running', checks: prior?.checks ?? [], batches: prior?.batches ?? [], limitations: [], attempts: [...(prior?.attempts ?? []), ...(prior ? [{ failedStep: prior.failedStep, failureLocation: prior.failureLocation, failureStatus: prior.failureStatus, finishedAt: prior.finishedAt }] : [])] };
const tables = ['workspaces', 'import_batches', 'feedback', 'feedback_patterns', 'annotations', 'issues', 'issue_evidence', 'actions', 'adaption_runs'];
const rpcs = ['import_feedback_batch', 'read_feedback_batch', 'read_feedback_issue_batch', 'update_feedback_issue', 'create_feedback_action'];
let currentStep = 'configuration', child, browser, base;
const users = [];
function save() { writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n'); }
async function check(name, work) {
  currentStep = name;
  await work();
  evidence.checks = evidence.checks.filter(c => c.name !== name);
  evidence.checks.push({ name, result: 'passed', checkedAt: new Date().toISOString() }); save();
  process.stdout.write('PASS ' + name + '\n');
}
function writes(enabled) {
  // Re-read to preserve any unrelated local edits and all private credential lines.
  const text = readFileSync(envPath, 'utf8');
  assert.equal((text.match(/^INSIGHTFLOW_WRITES_ENABLED=/gm) ?? []).length, 1);
  writeFileSync(envPath, text.replace(/^INSIGHTFLOW_WRITES_ENABLED=.*$/m, 'INSIGHTFLOW_WRITES_ENABLED=' + enabled));
}
async function management(path, query) {
  const response = await globalThis.fetch('https://api.supabase.com/v1/projects/' + target + path, {
    method: query ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + config.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    ...(query ? { body: JSON.stringify({ query, read_only: true }) } : {}), signal: globalThis.AbortSignal.timeout(45000),
  });
  assert.equal(response.status, query ? 201 : 200, 'Read-only management status');
  return response.json();
}
const catalogSql = `select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
 'anonWrite',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'userWrite',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) order by c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tables.map(t => "'" + t + "'").join(',')})),
 'policies',(select count(*) from pg_policies where schemaname='public' and tablename in (${tables.map(t => "'" + t + "'").join(',')}) and cmd='SELECT'),
 'rpcs',(select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'config',p.proconfig,
 'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'userExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${rpcs.map(t => "'" + t + "'").join(',')})),
 'authUsers',(select count(*) from auth.users),
 'authIdentityHash',(select md5(coalesce(string_agg(id::text || ':' || email,',' order by id),'')) from auth.users),
 'historyExists',to_regclass('supabase_migrations.schema_migrations') is not null) as result`;
async function catalog() { return (await management('/database/query', catalogSql))[0].result; }
function validateCatalog(value) {
  assert.equal(value.tables.length, 9); assert.equal(value.policies, 9); assert.equal(value.rpcs.length, 5);
  for (const table of value.tables) { assert(table.rls); assert(!table.anonWrite && !table.userWrite); }
  for (const rpc of value.rpcs) { assert(rpc.definer && rpc.userExecute && !rpc.anonExecute); assert(rpc.config.some(c => c === 'search_path=""' || c === 'search_path=')); }
}
async function startServer(enabled) {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', new URL(base).port], {
    env: { ...config, APP_ORIGIN: base, INSIGHTFLOW_WRITES_ENABLED: String(enabled) }, stdio: 'ignore', windowsHide: true,
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    assert(child.exitCode === null, 'Owned test server exited');
    try { if ((await globalThis.fetch(base + '/api/auth/session', { signal: globalThis.AbortSignal.timeout(1000) })).status === 401) return; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Owned server startup timeout');
}
function stopServer() {
  if (!child) return;
  if (child.exitCode === null) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  child = undefined;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  writes(false); stopServer(); await browser?.close();
  evidence.status = 'interrupted'; evidence.writesRestoredFalse = true; evidence.temporaryServerStopped = true;
  evidence.finishedAt = new Date().toISOString(); save(); process.exit(130);
});
async function app(user, path, { status = 200, schema, ...options } = {}) {
  const response = await user.context.request.fetch(base + path, { ...options, headers: { Origin: base, ...options.headers }, timeout: 45000 });
  assert.equal(response.status(), status, path + ' HTTP status');
  assert.match(response.headers()['cache-control'], /private.*no-store/, 'Private cache policy');
  const body = await response.json();
  if (schema) return schema.parse(body);
  if (status >= 400) contracts.ErrorResponse.parse(body);
  return body;
}
async function direct(user, path, { status = 200, method = 'GET', body } = {}) {
  const response = await globalThis.fetch(config.SUPABASE_URL + '/rest/v1/' + path, { method,
    headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, ...(user ? { Authorization: 'Bearer ' + user.token } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: globalThis.AbortSignal.timeout(30000) });
  assert.equal(response.status, status, 'PostgREST ' + path.split('?')[0] + ' HTTP status');
  return response.status === 204 ? null : response.json();
}
async function rpc(user, name, body, status = 200) { return direct(user, 'rpc/' + name, { method: 'POST', body, status }); }
async function login(user, label) {
  await user.page.goto(base);
  await user.page.locator('header').getByRole('button', { name: 'Sign In', exact: true }).click();
  const dialog = user.page.getByRole('dialog', { name: 'Sign in to InsightFlow workspace' });
  await dialog.getByLabel(/Email Address/).fill(config['LIVE_TEST_USER_' + label + '_EMAIL']);
  await dialog.getByLabel(/Password/).fill(config['LIVE_TEST_USER_' + label + '_PASSWORD']);
  await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(user.page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 30000 });
}
async function select(user) {
  await expect(user.page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 30000 });
  await user.page.waitForLoadState('networkidle');
  await user.page.getByTitle('Select active dataset or private batch').click();
  await expect(user.page.getByRole('menuitem').filter({ hasText: user.filename })).toBeVisible();
  await user.page.getByRole('menuitem').filter({ hasText: user.filename }).click();
  await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(user.filename);
}
async function totals(user) {
  const values = {};
  for (const table of tables) values[table] = (await direct(user, table + '?select=*')).length;
  return values;
}
async function signOut(user) {
  await user.page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
  await expect(user.page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
}

let initialCatalog;
try {
  await check('exact healthy development project and unchanged migrated catalogs', async () => {
    const project = await management('');
    assert.equal(project.id, target); assert.equal(project.name, 'InsightFlow-dev'); assert.equal(project.status, 'ACTIVE_HEALTHY');
    initialCatalog = await catalog(); validateCatalog(initialCatalog); evidence.preflight = initialCatalog;
    for (const [file, checksum] of [
      ['202610110001_foundation.sql', '2a29d7860a7a27bd3297ad69e31f1fd735a795b80091868ade930f36d0f32026'],
      ['202610110002_authenticated_rpcs.sql', '707ffb735c28dd5440a3b41fd0284736834e65dc432e43424aa9756317ee1e7f'],
    ]) assert.equal(createHash('sha256').update(readFileSync('supabase/migrations/' + file)).digest('hex'), checksum);
  });
  const portServer = createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  writes(true); await startServer(true);
  browser = await chromium.launch({ headless: true });
  await check('public official dataset and anonymous application denials', async () => {
    const context = await browser.newContext(); const anonymous = { context };
    const data = await app(anonymous, '/api/dashboard', { schema: contracts.DashboardResponse });
    assert.equal(data.data.summary.recordCount, 7000); assert.equal(data.meta.provenance.source, 'official_csv');
    await app(anonymous, '/api/batches', { status: 401 });
    await app(anonymous, '/api/feedback', { method: 'POST', data: {}, status: 401 });
    await context.close();
  });
  for (const label of ['A', 'B']) {
    const context = await browser.newContext(); const existing = evidence.batches.find(batch => batch.user === label && batch.source === 'upload');
    const user = { label, context, page: await context.newPage(), filename: runId + '-' + label + '.csv', batchId: existing?.batchId, issueId: existing?.issueId, actionId: existing?.actionId };
    users.push(user);
    await check(label + ' real browser password sign-in and independent ordinary JWT', async () => {
      await login(user, label);
      user.id = (await app(user, '/api/auth/session')).data.userId;
      const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.signInWithPassword({ email: config['LIVE_TEST_USER_' + label + '_EMAIL'], password: config['LIVE_TEST_USER_' + label + '_PASSWORD'] });
      assert(!error && data.session, 'Ordinary password authentication'); assert.equal(data.user.id, user.id);
      user.token = data.session.access_token; user.client = client;
      if (label === 'B') assert.notEqual(user.id, users[0].id);
      const cookies = (await context.cookies()).filter(c => c.name.startsWith('sb-'));
      assert(cookies.length); assert(cookies.every(c => c.httpOnly && c.sameSite === 'Lax' && c.path === '/'));
      user.before = await totals(user);
      const known = evidence.batches.filter(batch => batch.user === label).map(batch => batch.batchId).sort();
      const actual = (await direct(user, 'import_batches?select=id')).map(batch => batch.id).sort();
      assert.deepEqual(actual, known, 'Stop on unexpected existing user data; resume only this recorded run');
    });
  }
  if (!securityOnly) for (const user of users) {
    await check(user.label + ' four-row authored import, real database rows and idempotent retry', async () => {
      const tag = '[' + runId + ' ' + user.label + '] ';
      const records = user.label === 'A' ? [
        [tag + 'The product is defective.', 'Product Feedback'], [tag + 'The product is defective.', 'Product Feedback'],
        [tag + 'Checkout crashed.', 'Operational Issues'], [tag + 'I was not a victim of fraud.', 'Fraud and Scam'],
      ] : [
        [tag + 'Delivery was delayed.', 'Operational Issues'], [tag + 'Delivery was delayed.', 'Operational Issues'],
        [tag + 'An unresolved complaint.', 'Customer Service'], [tag + 'The product is excellent.', 'Product Feedback'],
      ];
      user.csv = 'review,category\n' + records.map(r => r.map(v => '"' + v.replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
      mkdirSync('artifacts/live/' + runId, { recursive: true }); writeFileSync('artifacts/live/' + runId + '/' + user.filename, user.csv);
      const multipart = { file: { name: user.filename, mimeType: 'text/csv', buffer: Buffer.from(user.csv) } };
      const imported = await app(user, '/api/feedback/import', { method: 'POST', multipart, schema: contracts.ImportResponse });
      user.batchId = imported.data.batchId;
      const existing = evidence.batches.find(batch => batch.user === user.label && batch.source === 'upload');
      if (existing) assert.equal(existing.batchId, user.batchId);
      else evidence.batches.push({ user: user.label, batchId: user.batchId, filename: user.filename, source: 'upload', recordCount: imported.data.recordCount, uniqueTextCount: imported.data.uniqueTextCount }); save();
      assert.equal(imported.data.recordCount, 4); assert.equal(imported.data.uniqueTextCount, 3); assert.equal(imported.data.repeatedRecordCount, 1); assert.equal(imported.data.rejectedCount, 0); assert.equal(imported.data.idempotentReplay, Boolean(existing));
      const rows = await direct(user, 'feedback?import_batch_id=eq.' + user.batchId);
      assert.equal(rows.length, 4); assert(rows.every(r => r.owner_id === user.id && r.observed_at === null && r.raw_text.includes(runId)));
      assert.equal((await direct(user, 'feedback_patterns?import_batch_id=eq.' + user.batchId)).length, 3);
      const retry = await app(user, '/api/feedback/import', { method: 'POST', multipart, schema: contracts.ImportResponse });
      assert.equal(retry.data.batchId, user.batchId); assert(retry.data.idempotentReplay);
      assert.equal((await direct(user, 'feedback?import_batch_id=eq.' + user.batchId)).length, 4);
    });
    await check(user.label + ' all private read contracts, evidence, missing dates and CSV export', async () => {
      const query = '?batchId=' + user.batchId;
      const dashboard = await app(user, '/api/dashboard' + query, { schema: contracts.DashboardResponse });
      assert.equal(dashboard.data.summary.recordCount, 4); assert.equal(dashboard.data.summary.timestampCoverage.covered, 0);
      assert.equal(dashboard.meta.mode, 'database'); assert.equal(dashboard.meta.provenance.source, 'upload');
      const records = await app(user, '/api/feedback' + query + '&pageSize=100', { schema: contracts.FeedbackResponse }); assert.equal(records.data.items.length, 4);
      const patterns = await app(user, '/api/feedback' + query + '&view=patterns', { schema: contracts.FeedbackResponse }); assert.equal(patterns.data.items.length, 3);
      const issues = await app(user, '/api/issues' + query, { schema: contracts.IssuesResponse }); assert(issues.data.items.length > 0); user.issueId = issues.data.items[0].id;
      assert(!issues.data.items.some(i => i.title.toLowerCase().includes('fraud')), 'Negated fraud does not generate a fraud issue');
      const detail = await app(user, '/api/issues/' + user.issueId, { schema: contracts.IssueDetailResponse }); assert(detail.data.evidence.length);
      for (const objective of ['safety', 'experience', 'operations']) await app(user, '/api/decisions' + query + '&objective=' + objective, { schema: contracts.DecisionsResponse });
      const lab = await app(user, '/api/data-lab' + query, { schema: contracts.DataLabResponse }); assert.equal(lab.data.adaption.runs.length, 0);
      const csv = await user.context.request.get(base + '/api/reports/export' + query + '&format=csv');
      assert.equal(csv.status(), 200); assert.match(csv.headers()['cache-control'], /private.*no-store/); assert.match(csv.headers()['content-type'], /text\/csv/);
      assert.match(await csv.text(), /"records","4","records"/);
    });
    await check(user.label + ' issue status and action persist in API and actual database', async () => {
      await app(user, '/api/issues/' + user.issueId, { method: 'PATCH', data: { status: 'investigating', notes: runId + ' ' + user.label + ' status note' }, schema: contracts.IssuePatchResponse });
      const priorAction = evidence.batches.find(batch => batch.batchId === user.batchId)?.actionId;
      const action = priorAction ? { data: (await direct(user, 'actions?id=eq.' + priorAction))[0].contract_json } : await app(user, '/api/issues/' + user.issueId + '/actions', { method: 'POST', data: { description: runId + ' ' + user.label + ' investigate evidence', notes: 'Authored development test' }, schema: contracts.ActionResponse });
      user.actionId = action.data.id;
      evidence.batches.find(b => b.batchId === user.batchId).issueId = user.issueId;
      evidence.batches.find(b => b.batchId === user.batchId).actionId = user.actionId; save();
      await user.page.reload();
      const detail = await app(user, '/api/issues/' + user.issueId, { schema: contracts.IssueDetailResponse });
      assert.equal(detail.data.issue.status, 'investigating'); assert(detail.data.actions.some(a => a.id === user.actionId));
      assert.equal((await direct(user, 'issues?id=eq.' + user.issueId))[0].status, 'investigating');
      assert.equal((await direct(user, 'actions?id=eq.' + user.actionId))[0].description, action.data.description);
    });
  }
  const [a, b] = users;
  if (!securityOnly) await check('A manual feedback persists as a separate private batch', async () => {
    const priorManual = evidence.batches.find(batch => batch.user === 'A' && batch.source === 'manual');
    if (priorManual) { assert.equal((await direct(a, 'feedback?import_batch_id=eq.' + priorManual.batchId)).length, 1); return; }
    const result = await app(a, '/api/feedback', { method: 'POST', data: { review: '[' + runId + ' A manual] The product is excellent.', category: 'Product Feedback' }, schema: contracts.ManualFeedbackResponse });
    evidence.batches.push({ user: 'A', batchId: result.meta.batchId, filename: 'manual.json', source: 'manual', recordCount: 1, uniqueTextCount: 1 }); save();
    assert.equal((await direct(a, 'feedback?import_batch_id=eq.' + result.meta.batchId)).length, 1); assert.equal(result.data.observedAt, null);
  });
  for (const [user, foreign] of [[a, b], [b, a]]) {
    await check(user.label + ' owner-only discovery, selected UI batch, reload and reauthentication', async () => {
      const list = await app(user, '/api/batches?pageSize=100', { schema: BatchesResponse });
      const expected = evidence.batches.filter(batch => batch.user === user.label).map(batch => batch.batchId).sort();
      assert.deepEqual(list.data.items.map(batch => batch.id).sort(), expected);
      assert.equal((await app(user, '/api/batches?batchId=' + foreign.batchId, { schema: BatchesResponse })).data.items.length, 0);
      await user.page.reload(); await select(user); await user.page.reload();
      await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(user.filename);
      await signOut(user); await login(user, user.label); await select(user);
      assert.equal((await app(user, '/api/dashboard?batchId=' + user.batchId)).data.summary.recordCount, 4);
    });
    await check(user.label + ' foreign application reads/export/issue writes denied reciprocally', async () => {
      for (const path of ['/api/dashboard', '/api/feedback', '/api/issues', '/api/decisions', '/api/data-lab', '/api/reports/export']) await app(user, path + '?batchId=' + foreign.batchId, { status: 404 });
      await app(user, '/api/issues/' + foreign.issueId, { status: 404 });
      await app(user, '/api/issues/' + foreign.issueId, { method: 'PATCH', data: { status: 'resolved' }, status: 404 });
      await app(user, '/api/issues/' + foreign.issueId + '/actions', { method: 'POST', data: { description: runId + ' forbidden cross-user action' }, status: 404 });
    });
    await check(user.label + ' direct database RLS and foreign RPC read/write isolation', async () => {
      const workspace = (await direct(foreign, 'workspaces?select=id'))[0].id;
      for (const table of tables) {
        const query = table === 'workspaces' ? '?id=eq.' + workspace : '?workspace_id=eq.' + workspace;
        assert.deepEqual(await direct(user, table + query), []);
      }
      assert.equal(await rpc(user, 'read_feedback_batch', { p_batch_id: foreign.batchId }), null);
      assert.equal(await rpc(user, 'read_feedback_issue_batch', { p_issue_id: foreign.issueId }), null);
      for (const [name, params] of [
        ['update_feedback_issue', { p_issue_id: foreign.issueId, p_patch: { status: 'resolved' } }],
        ['create_feedback_action', { p_issue_id: foreign.issueId, p_input: { description: runId + ' forbidden direct action' } }],
      ]) assert.equal((await rpc(user, name, params, 500)).code, 'P0002');
      for (const table of tables) {
        const patches = { workspaces: { is_demo: false }, import_batches: { filename: 'Denied test.csv' }, feedback: { raw_text: 'Denied' }, feedback_patterns: { normalized_text: 'Denied' }, annotations: { explanation: 'Denied' }, issues: { notes: 'Denied' }, issue_evidence: { role: 'context' }, actions: { notes: 'Denied' }, adaption_runs: { status: 'failed' } };
        // PATCH {} is a PostgREST no-op (204) and does not exercise UPDATE privilege.
        for (const [method, body] of [['POST', {}], ['PATCH', patches[table]], ['DELETE', undefined]]) {
          const denied = await direct(user, table + (table === 'workspaces' ? '?id=eq.' : '?workspace_id=eq.') + workspace, { method, body, status: 403 });
          assert.equal(denied.code, '42501');
        }
      }
    });
  }
  await check('anonymous protected RPC execution and direct private table reads denied', async () => {
    const inputs = [{ p_payload: {} }, { p_batch_id: a.batchId }, { p_issue_id: a.issueId }, { p_issue_id: a.issueId, p_patch: { status: 'resolved' } }, { p_issue_id: a.issueId, p_input: { description: 'Denied anonymous test' } }];
    for (let i = 0; i < rpcs.length; i++) assert.equal((await rpc(null, rpcs[i], inputs[i], 401)).code, '42501');
    for (const table of tables) assert.deepEqual(await direct(null, table + '?select=*'), []);
  });
  await check('invalid uploads, origin, UUIDs and failing RPC preserve all row counts', async () => {
    const before = await totals(a);
    for (const [buffer, status] of [[Buffer.from('wrong,headers\nno,valid\n'), 400], [Buffer.from('review,category\n"unfinished'), 400], [Buffer.alloc(5 * 1024 * 1024 + 1, 65), 413]]) await app(a, '/api/feedback/import', { method: 'POST', multipart: { file: { name: 'invalid.csv', mimeType: 'text/csv', buffer } }, status });
    await app(a, '/api/feedback', { method: 'POST', headers: { Origin: 'https://untrusted.invalid' }, data: { review: 'Blocked', category: 'Product Feedback' }, status: 403 });
    await app(a, '/api/batches?batchId=not-a-uuid', { status: 400 });
    await app(a, '/api/dashboard?batchId=' + randomUUID(), { status: 404 });
    await app(a, '/api/issues/demo-issue', { method: 'PATCH', data: { status: 'resolved' }, status: 403 });
    await rpc(a, 'import_feedback_batch', { p_payload: { unexpected: 'Rejected before commit' } }, 400);
    assert.deepEqual(await totals(a), before);
  });
  await check('real Auth refresh grant produces a verified ordinary-user session', async () => {
    const oldRefresh = a.client.auth.getSession();
    const previous = (await oldRefresh).data.session.refresh_token;
    const { data, error } = await a.client.auth.refreshSession();
    assert(!error && data.session); assert.equal(data.user.id, a.id); assert.notEqual(data.session.refresh_token, previous);
    a.token = data.session.access_token;
    assert.equal((await rpc(a, 'read_feedback_batch', { p_batch_id: a.batchId })).records.length, 4);
  });
  await check('sign-out denies private application access and clears UI; switching users has no stale A data', async () => {
    await signOut(a);
    await app(a, '/api/auth/session', { status: 401 }); await app(a, '/api/dashboard?batchId=' + a.batchId, { status: 401 });
    await app(a, '/api/feedback', { method: 'POST', data: { review: 'Unauthorized', category: 'Product Feedback' }, status: 401 });
    assert.equal(await a.page.evaluate(() => globalThis.localStorage.getItem('insightflow:selected-batch')), null);
    await expect(a.page.getByTitle('Select active dataset or private batch')).not.toContainText(a.filename);
    await login(a, 'B');
    assert.equal((await app(a, '/api/auth/session')).data.userId, b.id);
    assert((await app(a, '/api/batches')).data.items.every(batch => batch.id !== a.batchId));
    await a.page.getByTitle('Select active dataset or private batch').click();
    await expect(a.page.getByRole('menuitem').filter({ hasText: a.filename })).toHaveCount(0);
    await a.page.getByRole('menuitem').filter({ hasText: 'Public benchmark dataset' }).click();
    await signOut(a);
  });
  await check('malformed JWT rejected; previously issued JWT expiry limitation recorded', async () => {
    await direct({ token: 'invalid-test-token' }, 'feedback?select=id', { status: 401 });
    const read = await rpc(b, 'read_feedback_batch', { p_batch_id: b.batchId }); assert.equal(read.records.length, 4);
    evidence.limitations.push('Natural JWT expiry was not waited for. Real refresh, reload, sign-out and malformed-token rejection were tested; previously issued JWTs may remain valid until expiry. Browser automatic cookie refresh was not forced.');
  });
  await check('network failure displays safe UI error and recovers against the real API', async () => {
    await b.page.getByRole('link', { name: 'feedback', exact: true }).click();
    await expect(b.page.getByRole('heading', { name: 'feedback', exact: true })).toBeVisible();
    await b.page.route('**/api/feedback?**', route => route.abort('internetdisconnected'));
    await b.page.reload();
    await expect(b.page.getByText('Failed to load feedback', { exact: true })).toBeVisible({ timeout: 30000 });
    await b.page.unroute('**/api/feedback?**'); await b.page.reload();
    await expect(b.page.getByText('Failed to load feedback', { exact: true })).toHaveCount(0);
    evidence.limitations.push('Network error used a browser transport abort, explicitly a fault injection; successful recovery read the real API.');
  });
  await check('post-run migrated security catalogs and two existing Auth identities preserved', async () => {
    const final = await catalog(); validateCatalog(final);
    assert.equal(final.authUsers, initialCatalog.authUsers); assert.equal(final.authIdentityHash, initialCatalog.authIdentityHash);
    assert.deepEqual(final.tables, initialCatalog.tables); assert.deepEqual(final.rpcs, initialCatalog.rpcs); assert.equal(final.historyExists, initialCatalog.historyExists);
    evidence.finalCatalog = final;
    for (const user of users) evidence['rows' + user.label] = await totals(user);
  });
  await check('foreign batch UUID imports, owner injection and late transactional failures roll back', async () => {
    evidence.rejectedImportChecks = await verifyRejectedImports({ url: config.SUPABASE_URL, key: config.SUPABASE_PUBLISHABLE_KEY, users, runId });
  });
  await check('previously issued real user JWT remains readable after its own local Auth sign-out', async () => {
    for (const user of users) {
      const { error } = await user.client.auth.signOut({ scope: 'local' }); assert(!error, 'Ordinary SDK session logout');
      assert.equal((await rpc(user, 'read_feedback_batch', { p_batch_id: user.batchId })).records.length, 4);
    }
  });
  writes(false); stopServer(); await startServer(false);
  await check('restarted application denies writes while authenticated private reads still work', async () => {
    await app(b, '/api/auth/session');
    const before = await totals(b);
    await app(b, '/api/feedback', { method: 'POST', data: { review: 'Must not persist', category: 'Product Feedback' }, status: 401 });
    await app(b, '/api/dashboard?batchId=' + b.batchId);
    assert.deepEqual(await totals(b), before);
  });
  evidence.status = 'passed';
} catch (error) {
  // Playwright/SDK exceptions may contain inputs. Store only a safe class, step and status.
  evidence.status = 'failed'; evidence.failedStep = currentStep;
  evidence.failureType = error instanceof assert.AssertionError ? 'assertion' : 'operation';
  evidence.failureLocation = error.stack?.split('\n').find(line => line.includes('live-supabase.mjs:'))?.trim();
  evidence.browserState = [];
  for (const user of users) {
    evidence.browserState.push({ user: user.label,
      signedInButtonVisible: await user.page.locator('header').getByRole('button', { name: 'Sign Out' }).isVisible().catch(() => false),
      ownMenuItemCount: await user.page.getByRole('menuitem').filter({ hasText: user.filename }).count().catch(() => -1),
      privateMenuItems: await user.page.getByRole('menuitem').count().catch(() => -1),
    });
  }
  if (error instanceof assert.AssertionError && typeof error.actual === 'number' && typeof error.expected === 'number') evidence.failureStatus = { actual: error.actual, expected: error.expected };
  process.stderr.write('FAIL ' + currentStep + ' (' + evidence.failureType + ')\n');
  process.exitCode = 1;
} finally {
  writes(false); evidence.writesRestoredFalse = readFileSync(envPath, 'utf8').includes('INSIGHTFLOW_WRITES_ENABLED=false');
  stopServer(); await browser?.close();
  evidence.temporaryServerStopped = true; evidence.finishedAt = new Date().toISOString(); save();
  process.stdout.write(JSON.stringify({ status: evidence.status, runId, batches: evidence.batches, writesRestoredFalse: evidence.writesRestoredFalse }) + '\n');
}
