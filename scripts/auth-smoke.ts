import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, type Page, type Route } from '@playwright/test';
import { BatchesResponse } from '../src/lib/contracts/batches';

// Reworked from Phase 5A's external test-frontend-auth.ts. All Auth/private responses
// below are explicit browser doubles; public reads and unauthenticated denials are real.
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3100';
const output = resolve('artifacts/auth');
const userId = '11111111-1111-4111-8111-111111111111';
const batchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const newBatchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const foreignId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const examples = JSON.parse(readFileSync('docs/api-examples.json', 'utf8'));
const suites: string[] = [];
function pass(name: string) { suites.push(name); console.log('PASS', name); }
function batch(id = batchId) { return { id, filename: id === batchId ? 'Auth test authored fixture.csv' : 'New authored import.csv', source: 'upload', recordCount: 10, uniqueTextCount: 9, rejectedCount: 0, createdAt: '2026-10-11T00:00:00Z' }; }
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body) }); }
async function selector(page: Page) { await page.getByTitle('Select active dataset or private batch').click(); }
async function selectPrivate(page: Page, name = 'Auth test authored fixture.csv') { await selector(page); await page.getByRole('menuitem').filter({ hasText: name }).click(); }
async function main() {
  mkdirSync(output, { recursive: true });
  assert.equal((await fetch(base + '/api/batches')).status, 401);
  assert.equal((await fetch(base + '/api/auth/session')).status, 401);
  assert.equal((await fetch(base + '/api/feedback', { method: 'POST' })).status, 401);
  pass('real unconfigured Auth/discovery/manual write deny 401; no credential use');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const privateRequests: string[] = [];
    let authenticated = false, failLogin = true, failSignOut = false, deleted = false, imported = false, delayDashboard = false;
    let loginCalls = 0, uploadCalls = 0;
    let firstSession = true;
    let releaseUnsigned: (() => void) | undefined;
    let releaseDelayed: (() => void) | undefined;
    const session = () => ({ data: { userId: authenticated ? userId : null }, meta: { contractVersion: 'auth-1.0.0' } });
    await page.route('**/api/auth/session', async route => {
      if (firstSession) { firstSession = false; await new Promise<void>(resolve => { releaseUnsigned = resolve; }); }
      await json(route, authenticated ? session() : { error: { code: 'UNAUTHENTICATED', message: 'Test session absent' } }, authenticated ? 200 : 401);
    });
    await page.route('**/api/auth/sign-in', async route => {
      loginCalls++;
      assert.deepEqual(Object.keys(route.request().postDataJSON()).sort(), ['email', 'password']);
      if (failLogin) return json(route, { error: { code: 'UNAUTHENTICATED', message: 'Unable to sign in with those credentials' } }, 401);
      authenticated = true; await json(route, session());
    });
    await page.route('**/api/auth/sign-out', async route => {
      if (failSignOut) return json(route, { error: { code: 'NOT_CONFIGURED', message: 'Test provider unavailable' } }, 503);
      authenticated = false; await json(route, session());
    });
    await page.route('**/api/batches?**', async route => {
      const url = new URL(route.request().url());
      if (!authenticated) return json(route, { error: { code: 'UNAUTHENTICATED', message: 'Test expired session' } }, 401);
      const items = [...(deleted ? [] : [batch()]), ...(imported ? [batch(newBatchId)] : [])].filter(item => !url.searchParams.has('batchId') || url.searchParams.get('batchId') === item.id);
      await json(route, BatchesResponse.parse({ data: { items }, meta: { contractVersion: 'batches-1.0.0', page: 1, pageSize: 25, total: items.length, totalPages: items.length ? 1 : 0 } }));
    });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const selected = url.searchParams.get('batchId');
      if (!selected || url.pathname === '/api/batches') return route.fallback();
      privateRequests.push(url.pathname + url.search);
      if (!authenticated) return json(route, { error: { code: 'UNAUTHENTICATED', message: 'Test expired session' } }, 401);
      if (selected === foreignId || deleted) return json(route, { error: { code: 'NOT_FOUND', message: 'Requested resource not found' } }, 404);
      assert([batchId, newBatchId].includes(selected), 'Only discovered batch selected');
      if (url.pathname === '/api/reports/export') return route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'Content-Disposition': 'attachment; filename="auth-test.csv"', 'Cache-Control': 'private, no-store' }, body: '"metric","value","basis","source","limitation"\n"recordCount","10","records","auth-test-only","Auth test authored fixture"\n' });
      const key = url.pathname === '/api/dashboard' ? 'dashboard' : url.pathname === '/api/feedback' ? (url.searchParams.get('view') === 'patterns' ? 'feedbackPatterns' : 'feedbackRecords') : url.pathname === '/api/issues' ? 'issues' : url.pathname.startsWith('/api/issues/') ? 'issueDetail' : url.pathname === '/api/decisions' ? 'decisions' : 'dataLab';
      const body = structuredClone(examples[key]);
      // Replace fixture batch scope everywhere while keeping authored samples explicitly labeled.
      const serialized = JSON.stringify(body).replaceAll('fixture-batch-v1', selected);
      const scoped = JSON.parse(serialized);
      scoped.meta.mode = 'database'; scoped.meta.provenance.source = 'upload'; scoped.meta.provenance.label = 'Auth test authored fixture';
      if (key === 'decisions') scoped.data.objective = url.searchParams.get('objective') ?? 'safety';
      if (delayDashboard && key === 'dashboard') { delayDashboard = false; await new Promise<void>(resolve => { releaseDelayed = resolve; }); }
      await json(route, scoped);
    });
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'InsightFlow foundation' })).toBeVisible();
    await expect.poll(() => Boolean(releaseUnsigned)).toBe(true);
    await page.getByRole('link', { name: 'feedback', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'feedback', exact: true })).toBeVisible();
    const unsigned = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/session');
    releaseUnsigned!(); await unsigned; await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'feedback', exact: true })).toBeVisible();
    pass('delayed initial unsigned session cannot reset public navigation');
    for (const label of ['feedback', 'issues', 'decisions', 'reports', 'data-lab', 'Overview']) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: label === 'Overview' ? /InsightFlow foundation/ : label, exact: label !== 'Overview' })).toBeVisible();
    }
    pass('public six-screen navigation with real benchmark APIs and mocked unsigned session');
    await page.locator('header').getByRole('button', { name: 'Sign In', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to InsightFlow workspace' });
    const submit = dialog.getByRole('button', { name: 'Sign In', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel(/Email Address/).fill('invalid'); await dialog.getByLabel(/Password/).fill('auth-test-only');
    await submit.click(); assert.equal(loginCalls, 0);
    await dialog.getByLabel(/Email Address/).fill('test@example.com'); await submit.click();
    await expect(dialog.getByText('Unable to sign in with those credentials')).toBeVisible();
    await expect(dialog.getByLabel(/Password/)).toHaveValue('');
    await page.screenshot({ path: resolve(output, 'sign-in-failure.png') });
    pass('form required/email validation, mocked 401, password cleared and sanitized error');
    failLogin = false;
    await dialog.getByLabel(/Password/).fill('auth-test-only'); await submit.click();
    await expect(page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await selectPrivate(page);
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Auth test authored fixture.csv');
    await expect(page.getByText('Auth test authored fixture', { exact: false }).first()).toBeVisible();
    pass('mocked sign-in and server-discovered existing batch selection');
    for (const label of ['feedback', 'issues', 'decisions', 'reports', 'data-lab', 'Overview']) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: label === 'Overview' ? /InsightFlow foundation/ : label, exact: label !== 'Overview' })).toBeVisible();
      await expect(page.getByText('Auth test authored fixture', { exact: false }).first()).toBeVisible();
    }
    for (const path of ['/api/dashboard', '/api/feedback', '/api/issues', '/api/decisions', '/api/data-lab', '/api/reports/export']) assert(privateRequests.some(value => value.startsWith(path) && value.includes(batchId)), path);
    await page.getByRole('link', { name: 'reports', exact: true }).click();
    await expect(page.getByText('Executive Feedback Intelligence Briefing')).toBeVisible();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download CSV Export' }).click();
    const file = await download; await file.saveAs(resolve(output, 'mock-private-export.csv'));
    assert.match(readFileSync(resolve(output, 'mock-private-export.csv'), 'utf8'), /auth-test-only/);
    await page.getByRole('link', { name: /View evidence/ }).first().click();
    await expect(page.getByText('Supporting Evidence Quotes & Pattern Groups')).toBeVisible();
    assert(privateRequests.some(value => value.startsWith('/api/issues/') && value.includes(batchId)));
    pass('six private screens, evidence deep links and CSV export all carry selected batch (browser doubles)');
    await page.reload(); await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Auth test authored fixture.csv');
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.deepEqual(Object.keys(storage.local), ['insightflow:selected-batch']); assert.deepEqual(storage.session, {});
    assert.deepEqual(JSON.parse(storage.local['insightflow:selected-batch']), { userId, batchId });
    pass('reload reauthorizes restored selection; storage contains IDs only, no credentials/tokens');
    // Forged stored UUID must not cause any domain read for that UUID.
    await page.evaluate(({ userId, foreignId }) => localStorage.setItem('insightflow:selected-batch', JSON.stringify({ userId, batchId: foreignId })), { userId, foreignId });
    const count = privateRequests.length; await page.goto(base);
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Public benchmark');
    await selector(page); await expect(page.getByRole('menuitem').filter({ hasText: 'Auth test authored fixture.csv' })).toBeVisible();
    assert(!privateRequests.slice(count).some(value => value.includes(foreignId)));
    await page.getByRole('menuitem').filter({ hasText: 'Auth test authored fixture.csv' }).click();
    deleted = true; await page.getByRole('link', { name: 'feedback', exact: true }).click();
    await expect(page.getByText(/Requested resource not found/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Inspect record/ })).toHaveCount(0);
    deleted = false;
    pass('forged foreign restoration rejected before domain fetch; deleted batch errors without stale records');
    await page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Public benchmark');
    assert.equal(await page.evaluate(() => localStorage.getItem('insightflow:selected-batch')), null);
    pass('mocked successful sign-out clears selected batch, rendered private data and stored selection');
    // CSV preflight must make no import request.
    await page.route('**/api/feedback/import', async route => { uploadCalls++; await route.fallback(); });
    await page.getByTitle('Import CSV feedback batch').click();
    const csv = page.getByRole('dialog', { name: 'Import feedback CSV' });
    for (const [buffer, message] of [[Buffer.alloc(4 * 1024 * 1024 + 1), /exceeds the 4 MiB/], [Buffer.alloc(0), /empty/], [Buffer.from('review_extra,category_fake\na,b\n'), /CSV header must/]] as const) {
      await csv.locator('input[type=file]').setInputFiles({ name: 'auth-test.csv', mimeType: 'text/csv', buffer });
      await csv.getByRole('button', { name: 'Upload & Process CSV' }).click(); await expect(csv.getByText(message)).toBeVisible();
    }
    assert.equal(uploadCalls, 0);
    await csv.locator('input[type=file]').setInputFiles({ name: 'auth-test.csv', mimeType: 'text/csv', buffer: Buffer.from('review,category\nAuth test authored input,Product Feedback\n') });
    await csv.getByRole('button', { name: 'Upload & Process CSV' }).click();
    await expect(csv.getByText('401 UNAUTHENTICATED — Sign-in or Configuration Required')).toBeVisible();
    await expect(csv.getByText('Import Complete', { exact: true })).toHaveCount(0);
    await csv.getByRole('button', { name: 'Cancel', exact: true }).click();
    pass('4 MiB, zero-byte and exact-header preflight; real unsigned import 401 and no false success');
    authenticated = true; await page.reload(); await expect(page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await page.unroute('**/api/feedback/import');
    await page.route('**/api/feedback/import', async route => { imported = true; await json(route, { data: { batchId: newBatchId, recordCount: 10, uniqueTextCount: 9, repeatedRecordCount: 1, rejectedCount: 0, rejectedRows: [], idempotentReplay: false }, meta: { ...examples.dashboard.meta, batchId: newBatchId, mode: 'database', provenance: { source: 'upload', label: 'Auth test authored fixture', methodologyVersion: 'heuristic-v2' } } }); });
    await page.getByTitle('Import CSV feedback batch').click();
    await csv.locator('input[type=file]').setInputFiles({ name: 'auth-test.csv', mimeType: 'text/csv', buffer: Buffer.from('review,category\nAuth test authored input,Product Feedback\n') });
    await csv.getByRole('button', { name: 'Upload & Process CSV' }).click();
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('New authored import.csv');
    pass('mocked import success triggers fresh discovery and verifies returned ID before selection');
    await page.route('**/api/feedback', route => route.request().method() === 'POST'
      ? json(route, { error: { code: 'UNAUTHENTICATED', message: 'Authenticated persistence is not configured or enabled' } }, 401)
      : route.fallback());
    await page.getByTitle('Add manual feedback record').click();
    const manual = page.getByRole('dialog', { name: 'Add manual feedback' });
    await manual.locator('textarea').fill('Auth test only; no live write.');
    await manual.getByRole('button', { name: 'Save Feedback' }).click();
    await expect(manual.getByText('401 UNAUTHENTICATED — Authenticated Storage Required')).toBeVisible();
    await expect(page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('New authored import.csv');
    authenticated = false; await manual.getByRole('button', { name: 'Save Feedback' }).click();
    await expect(page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Public benchmark');
    pass('mocked write 401 rechecks Auth: disabled writes retain valid session; revocation clears private state');
    authenticated = true; await page.reload(); await selectPrivate(page);
    authenticated = false; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Public benchmark');
    pass('mocked session expiration clears private workspace on verification');
    authenticated = true; await page.reload(); await selectPrivate(page);
    failSignOut = true; await page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Server sign-out failed' })).toBeVisible();
    await expect(page.getByTitle('Select active dataset or private batch')).toContainText('Public benchmark');
    failSignOut = false; await page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    pass('mocked provider sign-out failure disclosed, private state cleared, retry ends session');
    authenticated = true; await page.goto(base); await expect(page.locator('header').getByRole('button', { name: 'Sign Out' })).toBeVisible();
    delayDashboard = true; await selectPrivate(page);
    await expect.poll(() => Boolean(releaseDelayed)).toBe(true);
    await page.locator('header').getByRole('button', { name: 'Sign Out' }).click();
    releaseDelayed!();
    await expect(page.locator('header').getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByText('Auth test authored fixture', { exact: true })).toHaveCount(0);
    pass('late private response after sign-out cannot repopulate remounted public UI');
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      await page.locator('header').getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(dialog).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dialog overflow at ${width}`);
      await page.screenshot({ path: resolve(output, `auth-dialog-${width}.png`) }); await page.keyboard.press('Escape');
    }
    pass('320/375/768/1440 navigation and auth modal layouts without overflow');
    assert.deepEqual(errors, []); pass('zero unhandled Chromium page errors');
    writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ suites, pageErrors: errors, authentication: 'mocked only; no live Supabase', publicApi: 'real local official artifact' }, null, 2));
  } finally { await browser.close(); }
  console.log(`${suites.length} authentication/browser suites passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
