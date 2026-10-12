// Real HTTPS acceptance for the dedicated development Preview. Never captures passwords/tokens.
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as contracts from '../src/lib/contracts/index.ts';
import { BatchesResponse } from '../src/lib/contracts/batches.ts';

const stage = process.argv[2]; assert(['auth', 'writes'].includes(stage));
const origin = 'https://insightflow-preview-demo.vercel.app', target = 'dbacbcbglbqmqwxscesu';
const directory = 'artifacts/live-preview'; mkdirSync(directory, { recursive: true });
const output = directory + '/' + stage + '.json';
let prior;
if (existsSync(output)) {
  assert((stage === 'auth' && process.argv.includes('--retry-readonly'))
    || (stage === 'writes' && (process.argv.includes('--resume-recorded-import') || process.argv.includes('--resume-verify'))), 'Preserve evidence. An uncertain write must be inspected, not automatically repeated');
  prior = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(prior.status, 'failed'); assert(!prior.pendingWrite);
  if (stage === 'auth') assert.equal(prior.batches.length, 0);
  else if (process.argv.includes('--resume-verify')) assert(prior.batches.length === 3 && prior.batches.filter(b => b.actionId).length === 2 && prior.failedStep === 'A all six private screens at mobile and desktop without overflow or page errors', 'Verification resume requires the completed recorded persistence run');
  else assert(prior.batches.length === 1 && prior.batches[0].user === 'A' && !prior.batches[0].actionId && prior.failedStep === 'A six private API screens, provenance, all decision objectives and CSV export', 'Only the inspected import-only attempt is resumable');
}
const deployment = JSON.parse(readFileSync(directory + '/deployment-' + (stage === 'auth' ? 'readonly' : 'writes') + '.json', 'utf8'));
assert.equal(deployment.readyState, 'READY'); assert.equal(deployment.target, null); assert.equal(deployment.origin, origin);
assert.equal(deployment.writesEnabled, stage === 'writes');
if (stage === 'writes') assert.equal(JSON.parse(readFileSync(directory + '/auth.json', 'utf8')).status, 'passed');
const config = { ...process.env };
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) config[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
assert.equal(new URL(config.SUPABASE_URL).hostname, target + '.supabase.co');
assert.equal(config.INSIGHTFLOW_WRITES_ENABLED, 'false');
for (const name of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ACCESS_TOKEN', ...['A', 'B'].flatMap(u => ['EMAIL', 'PASSWORD'].map(k => 'LIVE_TEST_USER_' + u + '_' + k))]) assert(config[name], 'Private configuration missing');
const tables = ['workspaces', 'import_batches', 'feedback', 'feedback_patterns', 'annotations', 'issues', 'issue_evidence', 'actions', 'adaption_runs'];
const rpcs = ['import_feedback_batch', 'read_feedback_batch', 'read_feedback_issue_batch', 'update_feedback_issue', 'create_feedback_action'];
const evidence = { stage, origin, deploymentId: deployment.id, targetReference: target, runId: stage === 'writes' && prior ? prior.runId : 'phase7b-' + randomUUID(),
  startedAt: new Date().toISOString(), status: 'running', responseMocks: false, checks: [], batches: stage === 'writes' && prior ? prior.batches : [], limitations: [],
  priorAttempts: prior ? [...(prior.priorAttempts ?? []), { startedAt: prior.startedAt, failedStep: prior.failedStep, failureLocation: prior.failureLocation, failureStatus: prior.failureStatus, checks: prior.checks }] : [] };
const users = []; let step = 'preflight', browser;
function save() { writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n'); }
async function check(name, action) {
  step = name; await action(); evidence.checks.push({ name, result: 'passed', checkedAt: new Date().toISOString() }); save(); process.stdout.write('PASS ' + name + '\n');
}
async function management(path, query) {
  const response = await globalThis.fetch('https://api.supabase.com/v1/projects/' + target + path, { method: query ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + config.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    ...(query ? { body: JSON.stringify({ query, read_only: true }) } : {}), signal: globalThis.AbortSignal.timeout(45000) });
  assert.equal(response.status, query ? 201 : 200); return response.json();
}
async function catalog() {
  return (await management('/database/query', `select jsonb_build_object(
    'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
    'anonWrite',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
    'userWrite',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tables.map(t => "'" + t + "'").join(',')})),
    'policies',(select count(*) from pg_policies where schemaname='public' and cmd='SELECT' and tablename in (${tables.map(t => "'" + t + "'").join(',')})),
    'rpcs',(select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'config',p.proconfig,
    'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'userExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${rpcs.map(t => "'" + t + "'").join(',')})),
    'authUsers',(select count(*) from auth.users),
    'identityHash',(select md5(coalesce(string_agg(id::text || ':' || email,',' order by id),'')) from auth.users)) as result`))[0].result;
}
function verifyCatalog(c) {
  assert.equal(c.tables.length, 9); assert.equal(c.policies, 9); assert.equal(c.rpcs.length, 5);
  assert(c.tables.every(t => t.rls && !t.anonWrite && !t.userWrite));
  assert(c.rpcs.every(r => r.definer && !r.anonExecute && r.userExecute && r.config.some(c => c === 'search_path=""' || c === 'search_path=')));
}
async function app(user, path, { status = 200, schema, ...options } = {}) {
  evidence.lastRequest = path;
  const response = await user.context.request.fetch(origin + path, { ...options, headers: { Origin: origin, ...options.headers }, timeout: 45000 });
  assert.equal(response.status(), status, path + ' HTTP status'); assert.match(response.headers()['cache-control'], /private.*no-store/);
  const body = await response.json();
  if (schema) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) evidence.contractIssues = parsed.error.issues.map(i => ({ code: i.code, path: i.path, expected: i.expected }));
    return schema.parse(body);
  }
  return status >= 400 ? contracts.ErrorResponse.parse(body) : body;
}
async function direct(user, path, { status = 200, method = 'GET', body } = {}) {
  const response = await globalThis.fetch(config.SUPABASE_URL + '/rest/v1/' + path, { method, headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY,
    ...(user ? { Authorization: 'Bearer ' + user.token } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: globalThis.AbortSignal.timeout(45000) });
  assert.equal(response.status, status, 'Database/RPC status'); return response.json();
}
const rpc = (user, name, body, status = 200) => direct(user, 'rpc/' + name, { method: 'POST', body, status });
async function totals(user) { const values = {}; for (const t of tables) values[t] = (await direct(user, t + '?select=*')).length; return values; }
async function login(user, label = user.label) {
  await user.page.goto(origin);
  await user.page.locator('header').getByRole('button', { name: 'Sign In', exact: true }).click();
  const dialog = user.page.getByRole('dialog', { name: 'Sign in to InsightFlow workspace' });
  await dialog.getByLabel(/Email Address/).fill(config['LIVE_TEST_USER_' + label + '_EMAIL']);
  await dialog.getByLabel(/Password/).fill(config['LIVE_TEST_USER_' + label + '_PASSWORD']);
  await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(user.page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 30000 });
}
async function select(user, batch) {
  await user.page.waitForLoadState('networkidle');
  await user.page.getByTitle('Select active dataset or private batch').click();
  await user.page.getByRole('menuitem').filter({ hasText: batch.filename }).click();
  await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(batch.filename);
}
save();
try {
  let before;
  await check('exact healthy development project, nine RLS tables, five RPCs and denied direct writes', async () => {
    const project = await management(''); assert.equal(project.id, target); assert.equal(project.name, 'InsightFlow-dev'); assert.equal(project.status, 'ACTIVE_HEALTHY');
    before = await catalog(); verifyCatalog(before); evidence.preflight = before;
    const auth = await management('/config/auth');
    evidence.authConfiguration = { emailEnabled: auth.external_email_enabled, callbackConfigured: auth.uri_allow_list?.split(',').includes(origin + '/api/auth/callback') ?? false,
      passwordFlowUsesRedirect: false };
  });
  browser = await chromium.launch({ headless: true });
  const anonymous = { context: await browser.newContext() };
  await check('anonymous public synthetic demo remains available and private access/writes denied', async () => {
    const dashboard = await app(anonymous, '/api/dashboard', { schema: contracts.DashboardResponse });
    assert.equal(dashboard.meta.mode, 'fixture'); assert.equal(dashboard.meta.provenance.source, 'fixture'); assert.equal(dashboard.data.summary.recordCount, 10);
    await app(anonymous, '/api/batches', { status: 401 }); await app(anonymous, '/api/auth/session', { status: 401 });
    await app(anonymous, '/api/feedback', { method: 'POST', data: {}, status: 401 });
    await app(anonymous, '/api/feedback/import', { method: 'POST', data: '', status: 401 });
  });
  for (const label of ['A', 'B']) {
    const context = await browser.newContext({ acceptDownloads: true }); const user = { label, context, page: await context.newPage() }; users.push(user);
    await check(label + ' real HTTPS browser login, Secure HttpOnly Lax cookies, refresh persistence and owner discovery', async () => {
      await login(user); user.id = (await app(user, '/api/auth/session')).data.userId;
      const cookies = (await context.cookies()).filter(c => c.name.startsWith('sb-'));
      assert(cookies.length && cookies.every(c => c.httpOnly && c.secure && c.sameSite === 'Lax' && c.path === '/' && c.domain === new URL(origin).hostname));
      await user.page.reload(); assert.equal((await app(user, '/api/auth/session')).data.userId, user.id);
      const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.signInWithPassword({ email: config['LIVE_TEST_USER_' + label + '_EMAIL'], password: config['LIVE_TEST_USER_' + label + '_PASSWORD'] });
      assert(!error && data.session); assert.equal(data.user.id, user.id); user.client = client; user.token = data.session.access_token;
      user.initial = (await app(user, '/api/batches?pageSize=100', { schema: BatchesResponse })).data.items;
      const rows = await direct(user, 'import_batches?select=id,owner_id'); assert(rows.every(r => r.owner_id === user.id));
      assert.deepEqual(user.initial.map(b => b.id).sort(), rows.map(r => r.id).sort()); user.before = await totals(user);
      user.initial = user.initial.filter(b => !evidence.batches.some(recorded => recorded.batchId === b.id));
      if (label === 'B') assert.notEqual(user.id, users[0].id);
    });
  }
  const [a, b] = users;
  if (stage === 'auth') {
    for (const [user, foreign] of [[a, b], [b, a]]) await check(user.label + ' read-only owner selection, foreign reads hidden and write gate denies authenticated request', async () => {
      assert(user.initial.length && foreign.initial.length, 'Existing Phase 6A private batches required');
      await select(user, user.initial[0]); await user.page.reload();
      await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(user.initial[0].filename);
      const data = await app(user, '/api/dashboard?batchId=' + user.initial[0].id, { schema: contracts.DashboardResponse }); assert.equal(data.meta.mode, 'database');
      assert.equal((await app(user, '/api/batches?batchId=' + foreign.initial[0].id)).data.items.length, 0);
      await app(user, '/api/dashboard?batchId=' + foreign.initial[0].id, { status: 404 });
      await app(user, '/api/feedback', { method: 'POST', data: { review: 'Must not persist', category: 'Product Feedback' }, status: 401 });
      assert.deepEqual(await totals(user), user.before);
    });
  } else {
    for (const user of users) {
      await check(user.label + ' real browser CSV import creates private four-row/three-pattern batch', async () => {
        const recorded = evidence.batches.find(b => b.user === user.label && b.source !== 'manual');
        if (recorded) {
          user.batchId = recorded.batchId; user.filename = recorded.filename;
          user.csv = readFileSync(directory + '/' + user.filename, 'utf8');
          const rows = await direct(user, 'feedback?import_batch_id=eq.' + user.batchId);
          assert.equal(rows.length, 4); assert(rows.every(r => r.owner_id === user.id && r.raw_text.includes(evidence.runId)));
          await select(user, { filename: user.filename }); return;
        }
        const tag = '[' + evidence.runId + ' ' + user.label + '] ';
        const records = [[tag + 'The product is defective.', 'Product Feedback'], [tag + 'The product is defective.', 'Product Feedback'],
          [tag + 'Checkout crashed.', 'Operational Issues'], [tag + 'I was not a victim of fraud.', 'Fraud and Scam']];
        user.csv = 'review,category\n' + records.map(r => r.map(v => '"' + v.replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
        user.filename = evidence.runId + '-' + user.label + '.csv'; writeFileSync(directory + '/' + user.filename, user.csv);
        await user.page.getByTitle('Import CSV feedback batch').click();
        const dialog = user.page.getByRole('dialog', { name: 'Import feedback CSV' });
        await dialog.locator('input[type=file]').setInputFiles({ name: user.filename, mimeType: 'text/csv', buffer: Buffer.from(user.csv) });
        const waiting = user.page.waitForResponse(r => new URL(r.url()).pathname === '/api/feedback/import' && r.request().method() === 'POST');
        evidence.pendingWrite = { user: user.label, kind: 'import', filename: user.filename }; save();
        await dialog.getByRole('button', { name: 'Upload & Process CSV' }).click();
        const response = await waiting; assert.equal(response.status(), 200); const imported = contracts.ImportResponse.parse(await response.json());
        user.batchId = imported.data.batchId; evidence.batches.push({ user: user.label, batchId: user.batchId, filename: user.filename, records: 4, patterns: 3 });
        delete evidence.pendingWrite; save();
        assert.deepEqual([imported.data.recordCount, imported.data.uniqueTextCount, imported.data.repeatedRecordCount], [4, 3, 1]);
        await user.page.getByRole('button', { name: 'Close CSV import' }).click();
        await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(user.filename);
        const rows = await direct(user, 'feedback?import_batch_id=eq.' + user.batchId);
        assert.equal(rows.length, 4); assert(rows.every(r => r.owner_id === user.id && r.observed_at === null && r.raw_text.includes(evidence.runId)));
        const replay = await app(user, '/api/feedback/import', { method: 'POST', multipart: { file: { name: user.filename, mimeType: 'text/csv', buffer: Buffer.from(user.csv) } }, schema: contracts.ImportResponse });
        assert.equal(replay.data.batchId, user.batchId); assert(replay.data.idempotentReplay);
      });
      await check(user.label + ' six private API screens, provenance, all decision objectives and CSV export', async () => {
        const query = '?batchId=' + user.batchId;
        const dashboard = await app(user, '/api/dashboard' + query, { schema: contracts.DashboardResponse }); assert.equal(dashboard.data.summary.recordCount, 4); assert.equal(dashboard.meta.provenance.source, 'upload');
        await app(user, '/api/feedback' + query, { schema: contracts.FeedbackResponse });
        const issues = await app(user, '/api/issues' + query, { schema: contracts.IssuesResponse }); user.issueId = issues.data.items[0].id;
        assert(!issues.data.items.some(i => i.title.toLowerCase().includes('fraud')));
        for (const objective of ['safety', 'experience', 'operations']) await app(user, '/api/decisions' + query + '&objective=' + objective, { schema: contracts.DecisionsResponse });
        const lab = await app(user, '/api/data-lab' + query, { schema: contracts.DataLabResponse }); assert.equal(lab.data.adaption.runs.length, 0);
        const csv = await user.context.request.get(origin + '/api/reports/export' + query + '&format=csv'); assert.equal(csv.status(), 200); assert.match(await csv.text(), /"records","4","records"/);
      });
      await check(user.label + ' real browser issue update/action persist across refresh and in Supabase', async () => {
        const recorded = evidence.batches.find(b => b.batchId === user.batchId);
        if (recorded.actionId) {
          user.actionId = recorded.actionId;
          assert.equal(user.issueId, recorded.issueId);
          const detail = await app(user, '/api/issues/' + user.issueId, { schema: contracts.IssueDetailResponse });
          assert.equal(detail.data.issue.status, 'investigating'); assert(detail.data.actions.some(a => a.id === user.actionId));
          await user.page.goto(origin + '/issues?id=' + user.issueId);
          await expect(user.page.getByText(evidence.runId + ' investigate authored evidence', { exact: true })).toBeVisible({ timeout: 30000 });
          return;
        }
        await user.page.goto(origin + '/issues?id=' + user.issueId);
        const status = user.page.locator('form').filter({ hasText: 'Update Issue Status' });
        await status.locator('select').selectOption('investigating'); await status.locator('textarea').fill(evidence.runId + ' status note');
        const updating = user.page.waitForResponse(r => r.url().includes('/api/issues/' + user.issueId) && r.request().method() === 'PATCH');
        await status.getByRole('button', { name: 'Save Status Update' }).click(); assert.equal((await updating).status(), 200);
        const action = user.page.locator('form').filter({ hasText: 'Add Tracking Action' });
        await action.locator('input').nth(0).fill(evidence.runId + ' investigate authored evidence');
        await action.locator('input').nth(1).fill('Synthetic development acceptance');
        const adding = user.page.waitForResponse(r => r.url().endsWith('/api/issues/' + user.issueId + '/actions') && r.request().method() === 'POST');
        evidence.pendingWrite = { user: user.label, kind: 'action', issueId: user.issueId }; save();
        await action.getByRole('button', { name: 'Log Tracking Action' }).click();
        const response = await adding; assert.equal(response.status(), 200); user.actionId = contracts.ActionResponse.parse(await response.json()).data.id;
        Object.assign(evidence.batches.find(b => b.batchId === user.batchId), { issueId: user.issueId, actionId: user.actionId }); delete evidence.pendingWrite; save();
        await user.page.reload(); await expect(user.page.getByText(evidence.runId + ' investigate authored evidence', { exact: true })).toBeVisible();
        const detail = await app(user, '/api/issues/' + user.issueId, { schema: contracts.IssueDetailResponse }); assert.equal(detail.data.issue.status, 'investigating'); assert(detail.data.actions.some(a => a.id === user.actionId));
        assert.equal((await direct(user, 'issues?id=eq.' + user.issueId))[0].status, 'investigating'); assert.equal((await direct(user, 'actions?id=eq.' + user.actionId)).length, 1);
      });
    }
    await check('A real browser manual feedback persists with unknown complaint date in its own private batch', async () => {
      const recorded = evidence.batches.find(b => b.source === 'manual');
      if (recorded) {
        a.manualBatchId = recorded.batchId;
        const rows = await direct(a, 'feedback?import_batch_id=eq.' + a.manualBatchId);
        assert.equal(rows.length, 1); assert.equal(rows[0].observed_at, null);
        await select(a, { filename: a.filename }); return;
      }
      await a.page.getByTitle('Add manual feedback record').click();
      const dialog = a.page.getByRole('dialog', { name: 'Add manual feedback' });
      await dialog.locator('textarea').fill('[' + evidence.runId + ' manual] The product is excellent.');
      await dialog.locator('select').selectOption('Product Feedback');
      const waiting = a.page.waitForResponse(r => new URL(r.url()).pathname === '/api/feedback' && r.request().method() === 'POST');
      evidence.pendingWrite = { user: 'A', kind: 'manual' }; save();
      await dialog.getByRole('button', { name: 'Save Feedback' }).click();
      const response = await waiting; assert.equal(response.status(), 200);
      const result = contracts.ManualFeedbackResponse.parse(await response.json());
      a.manualBatchId = result.meta.batchId; evidence.batches.push({ user: 'A', source: 'manual', batchId: a.manualBatchId, records: 1, patterns: 1 });
      delete evidence.pendingWrite; save(); assert.equal(result.data.observedAt, null);
      assert.equal((await direct(a, 'feedback?import_batch_id=eq.' + a.manualBatchId)).length, 1);
      await a.page.getByRole('button', { name: 'Close manual feedback' }).click();
      await select(a, { filename: a.filename });
    });
    for (const [user, foreign] of [[a, b], [b, a]]) {
      await check(user.label + ' owner discovery preserves earlier batches and cross-user reads/exports/writes denied', async () => {
        const list = (await app(user, '/api/batches?pageSize=100', { schema: BatchesResponse })).data.items;
        assert.deepEqual(list.map(b => b.id).sort(), [...user.initial.map(b => b.id), ...evidence.batches.filter(b => b.user === user.label).map(b => b.batchId)].sort());
        assert.equal((await app(user, '/api/batches?batchId=' + foreign.batchId)).data.items.length, 0);
        for (const path of ['/api/dashboard', '/api/feedback', '/api/issues', '/api/decisions', '/api/data-lab', '/api/reports/export']) await app(user, path + '?batchId=' + foreign.batchId, { status: 404 });
        await app(user, '/api/issues/' + foreign.issueId, { status: 404 });
        await app(user, '/api/issues/' + foreign.issueId, { method: 'PATCH', data: { status: 'resolved' }, status: 404 });
        await app(user, '/api/issues/' + foreign.issueId + '/actions', { method: 'POST', data: { description: 'Forbidden cross-user action' }, status: 404 });
        assert.deepEqual(await direct(user, 'feedback?import_batch_id=eq.' + foreign.batchId), []);
        assert.equal(await rpc(user, 'read_feedback_batch', { p_batch_id: foreign.batchId }), null);
        assert.equal((await rpc(user, 'update_feedback_issue', { p_issue_id: foreign.issueId, p_patch: { status: 'resolved' } }, 500)).code, 'P0002');
        assert.equal((await rpc(user, 'create_feedback_action', { p_issue_id: foreign.issueId, p_input: { description: 'Forbidden' } }, 500)).code, 'P0002');
      });
      await check(user.label + ' all six private screens at mobile and desktop without overflow or page errors', async () => {
        const errors = []; user.page.on('pageerror', () => errors.push('pageerror'));
        for (const width of [320, 375, 1440]) {
          await user.page.setViewportSize({ width, height: 1000 });
          for (const [path, heading] of [['/', 'Command Center'], ['/feedback', 'Feedback Explorer'], ['/issues', 'Issue Intelligence'], ['/decisions', 'Decision Studio'], ['/reports', 'Executive Reports'], ['/data-lab', 'Data Lab']]) {
            evidence.uiProbe = { user: user.label, width, path };
            await user.page.getByRole('navigation').getByRole('link', { name: path === '/' ? 'Overview' : path.slice(1), exact: true }).click();
            await expect(user.page.getByRole('heading', { name: heading, exact: false }).first()).toBeVisible();
            await expect(user.page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 30000 });
            await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(user.filename, { timeout: 30000 });
            const size = await user.page.evaluate(() => ({ viewport: globalThis.innerWidth, body: globalThis.document.documentElement.scrollWidth })); assert(size.body <= size.viewport + 1);
          }
        }
        assert.deepEqual(errors, []);
        await user.page.goto(origin + '/reports');
        await expect(user.page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 30000 });
        await expect(user.page.getByTitle('Select active dataset or private batch')).toContainText(user.filename, { timeout: 30000 });
        await expect(user.page.getByRole('button', { name: 'Print Report (PDF)' })).toBeEnabled({ timeout: 30000 });
        const downloading = user.page.waitForEvent('download'); await user.page.getByRole('button', { name: 'Download CSV Export' }).click();
        await (await downloading).saveAs(directory + '/private-' + user.label + '.csv');
        assert.match(readFileSync(directory + '/private-' + user.label + '.csv', 'utf8'), /"records","4","records"/);
      });
    }
    await check('malformed upload, cross-origin mutation and public issue mutation rejected without data changes', async () => {
      const counts = await totals(a);
      await app(a, '/api/feedback/import', { method: 'POST', multipart: { file: { name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('wrong,headers\ninvalid,row\n') } }, status: 400 });
      await app(a, '/api/feedback', { method: 'POST', headers: { Origin: 'https://untrusted.invalid' }, data: { review: 'Forbidden', category: 'Product Feedback' }, status: 403 });
      await app(a, '/api/issues/suspected_fraud', { method: 'PATCH', data: { status: 'resolved' }, status: 403 });
      assert.deepEqual(await totals(a), counts);
    });
  }
  await check('anonymous database/RPC denials, invalid token and direct client table writes denied', async () => {
    for (const table of tables) {
      assert.deepEqual(await direct(null, table + '?select=*'), []);
      assert.equal((await direct(a, table, { method: 'POST', body: {}, status: 403 })).code, '42501');
    }
    for (const [name, body] of [['import_feedback_batch', { p_payload: {} }], ['read_feedback_batch', { p_batch_id: a.initial[0].id }]]) assert.equal((await rpc(null, name, body, 401)).code, '42501');
    await direct({ token: 'invalid-test-token' }, 'feedback?select=id', { status: 401 });
  });
  for (const user of users) await check(user.label + ' sign-out clears secure cookies, private access and selected batch; public demo restored', async () => {
    await user.page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
    await expect(user.page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await app(user, '/api/auth/session', { status: 401 }); await app(user, '/api/dashboard?batchId=' + (user.batchId || user.initial[0].id), { status: 401 });
    assert.equal((await user.context.cookies()).filter(c => c.name.startsWith('sb-')).length, 0);
    assert.equal(await user.page.evaluate(() => globalThis.localStorage.getItem('insightflow:selected-batch')), null);
    assert.equal((await app(user, '/api/dashboard')).data.summary.recordCount, 10);
    await user.client.auth.signOut({ scope: 'local' });
  });
  await check('same browser switches A to B without stale A batches and reauthenticates persistent private data', async () => {
    await login(a, 'B'); assert.equal((await app(a, '/api/auth/session')).data.userId, b.id);
    const own = (await app(a, '/api/batches?pageSize=100')).data.items;
    const foreignId = a.batchId || a.initial[0].id;
    assert(!own.some(batch => batch.id === foreignId));
    await app(a, '/api/dashboard?batchId=' + foreignId, { status: 404 });
    const batch = stage === 'writes' ? { id: b.batchId, filename: b.filename } : b.initial.find(batch => batch.source === 'upload');
    await select(a, batch); await a.page.reload();
    await expect(a.page.getByTitle('Select active dataset or private batch')).toContainText(batch.filename);
    assert.equal((await app(a, '/api/dashboard?batchId=' + batch.id)).meta.mode, 'database');
    await a.page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
    await expect(a.page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });
  await check('remote catalogs and existing Auth identities unchanged; local write flag remains false', async () => {
    const after = await catalog(); verifyCatalog(after); assert.deepEqual(after, before); evidence.postflight = after;
    assert(readFileSync('.env.local', 'utf8').includes('INSIGHTFLOW_WRITES_ENABLED=false'));
  });
  evidence.limitations.push('Natural JWT expiration and forced browser refresh-token rotation were not waited for. Refresh persistence and sign-out were tested. Previously issued bearer JWTs can remain valid until expiry; RLS remains owner-scoped. No password reset, signup or PKCE email link flow was tested. Password login does not use redirect URL allowlists.');
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed'; evidence.failedStep = step;
  evidence.failureType = error instanceof assert.AssertionError ? 'assertion' : 'operation';
  evidence.failureName = error.name;
  evidence.failureLocation = error.stack?.split('\n').find(line => line.includes('hosted-preview-smoke.mjs:'))?.trim();
  if (error instanceof assert.AssertionError && typeof error.actual === 'number' && typeof error.expected === 'number') evidence.failureStatus = { actual: error.actual, expected: error.expected };
  process.stderr.write('FAIL ' + step + ' (' + evidence.failureType + ')\n'); process.exitCode = 1;
} finally {
  await browser?.close(); evidence.finishedAt = new Date().toISOString(); save();
  process.stdout.write(JSON.stringify({ stage, status: evidence.status, checks: evidence.checks.length, batchesCreated: evidence.batches.length, pendingWrite: Boolean(evidence.pendingWrite) }) + '\n');
}
