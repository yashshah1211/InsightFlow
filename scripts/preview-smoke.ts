import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { DashboardResponse, FeedbackResponse, DataLabResponse, DecisionsResponse, IssuesResponse, IssueDetailResponse, ErrorResponse } from '../src/lib/contracts';
import { fixtureRecords } from '../src/lib/fixtures';
import { simulatePriorities } from '../src/lib/analysis/simulation';

const base = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const output = resolve('artifacts/preview', new URL(base).hostname);
mkdirSync(output, { recursive: true });
const checks: string[] = [], sizes: { path: string; bytes: number }[] = [];
function pass(message: string) { checks.push(message); console.log('PASS', message); }
async function get(path: string) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  const text = await response.text(); sizes.push({ path, bytes: Buffer.byteLength(text) });
  assert(Buffer.byteLength(text) < 4_500_000, 'Vercel response limit');
  assert(response.headers.get('cache-control')?.includes('no-store'));
  return JSON.parse(text);
}
async function feedbackAfter(page: Page, action: () => Promise<unknown>) {
  const waiting = page.waitForResponse(response => new URL(response.url()).pathname === '/api/feedback' && response.request().method() === 'GET');
  await action(); const response = await waiting; assert.equal(response.status(), 200);
  return FeedbackResponse.parse(await response.json());
}
async function main() {
  const dashboard = DashboardResponse.parse(await get('/api/dashboard'));
  assert.equal(dashboard.meta.mode, 'fixture'); assert.equal(dashboard.meta.provenance.source, 'fixture');
  assert.deepEqual([dashboard.data.summary.recordCount, dashboard.data.summary.uniqueTextCount, dashboard.data.summary.repeatedRecordCount], [10, 9, 1]);
  assert.equal(dashboard.data.summary.timestampCoverage.covered, 0);
  assert.equal(dashboard.data.summary.uniqueCustomers.status, 'unavailable');
  const all = FeedbackResponse.parse(await get('/api/feedback?pageSize=100'));
  assert.deepEqual(all.data.items, fixtureRecords());
  const patterns = FeedbackResponse.parse(await get('/api/feedback?view=patterns&pageSize=100'));
  assert.equal(patterns.meta.total, 9);
  assert.equal(patterns.data.items.reduce((sum, item) => sum + (item.kind === 'pattern' ? item.occurrenceCount : 0), 0), 10);
  for (let page = 1; page <= 5; page++) {
    const body = FeedbackResponse.parse(await get(`/api/feedback?pageSize=2&page=${page}`));
    assert.equal(body.meta.page, page); assert.equal(body.meta.totalPages, 5);
    assert.deepEqual(body.data.items, fixtureRecords().slice((page - 1) * 2, page * 2));
  }
  pass('exact authored source rows, 10 records / 9 patterns / 1 repeat, missing dates and five API pages');
  const issues = IssuesResponse.parse(await get('/api/issues'));
  assert.equal(issues.data.items.length, 5);
  for (const item of issues.data.items) {
    const detail = IssueDetailResponse.parse(await get(`/api/issues/${item.id}`));
    assert(detail.data.evidence.length > 0);
    for (const evidence of detail.data.evidence) {
      assert(patterns.data.items.some(pattern => pattern.normalizedHash === evidence.pattern.normalizedHash));
      for (const sample of evidence.samples) assert(fixtureRecords().some(record => record.id === sample.id && record.rawText === sample.rawText && record.normalizedHash === sample.normalizedHash));
    }
  }
  pass('all five issues reference genuine authored evidence');
  const lab = DataLabResponse.parse(await get('/api/data-lab'));
  assert.equal(lab.data.officialDatasetAssertions, 'pending'); assert.equal(lab.data.adaption.status, 'not_configured');
  assert.deepEqual(lab.data.adaption.runs, []); assert.equal(lab.data.adaption.evaluation.status, 'unavailable');
  pass('no official verification claim, invented Adaption run, quality metric or balance');
  for (const path of ['/api/feedback?page=0', '/api/feedback?pageSize=101', '/api/feedback?q=a&q=b', '/api/decisions?objective=invalid']) {
    const response = await fetch(base + path); assert.equal(response.status, 400); ErrorResponse.parse(await response.json());
  }
  for (const [path, method] of [['/api/feedback', 'POST'], ['/api/feedback/import', 'POST'], ['/api/issues/suspected_fraud', 'PATCH'], ['/api/issues/suspected_fraud/actions', 'POST'], ['/api/batches', 'GET'], ['/api/feedback?batchId=11111111-1111-4111-8111-111111111111', 'GET']]) {
    const response = await fetch(base + path, { method }); assert.equal(response.status, 401, path); ErrorResponse.parse(await response.json());
  }
  for (const path of ['/.env.local', '/data/raw/customer_feedback.csv', '/data/processed/official.json', '/artifacts/adaption/phase6b-synthetic/human-review.csv']) assert.equal((await fetch(base + path)).status, 404, path);
  const otherBatch = await fetch(base + '/api/feedback?batchId=official-batch-v1'); assert.equal(otherBatch.status, 404);
  pass('bad queries rejected, four writes and private reads denied, private paths and official batch unavailable');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Object.assign(window, { previewPrintCalls: 0 }); window.print = () => { const w = window as unknown as { previewPrintCalls: number }; w.previewPrintCalls++; }; });
    await page.goto(base + '/feedback');
    await expect(page.getByRole('button', { name: /^Inspect record/ }).first()).toBeVisible();
    let body = await feedbackAfter(page, () => page.getByRole('button', { name: 'Distinct Patterns View', exact: true }).click());
    assert.equal(body.meta.total, 9);
    const first = body.data.items[0]; assert.equal(first.kind, 'pattern');
    if (first.kind === 'pattern') {
      await page.getByRole('button', { name: /^Inspect pattern/ }).first().click();
      await expect(page.getByRole('dialog', { name: 'Feedback evidence' }).getByText(first.exampleOriginalText, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close detail drawer' }).click();
    }
    body = await feedbackAfter(page, () => page.getByLabel('Records per page').selectOption('10'));
    assert.equal(body.meta.pageSize, 10);
    await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
    body = await feedbackAfter(page, () => page.getByLabel('Category filter').selectOption('Operational Issues'));
    assert.equal(body.meta.total, 1);
    body = await feedbackAfter(page, () => page.getByLabel('Sentiment filter').selectOption('negative'));
    assert(body.data.items.every(item => item.annotation?.sentiment === 'negative'));
    await feedbackAfter(page, () => page.getByLabel('Category filter').selectOption(''));
    await feedbackAfter(page, () => page.getByLabel('Sentiment filter').selectOption(''));
    await page.getByLabel('Search review text').fill('not a victim of fraud');
    body = await feedbackAfter(page, () => page.getByRole('button', { name: 'Search', exact: true }).click());
    assert.equal(body.meta.total, 1); assert(!body.data.items[0].annotation?.issueTypes.includes('suspected_fraud'));
    await feedbackAfter(page, () => page.getByRole('button', { name: 'Search', exact: true }).click());
    await page.getByLabel('Search review text').fill('no-match-preview-xyz');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No matching feedback found')).toBeVisible();
    await feedbackAfter(page, () => page.getByRole('button', { name: 'Clear', exact: true }).click());
    pass('browser search, repeated search, category/sentiment filters, page-size control, last-page boundary and evidence drawer');
    await page.goto(base + '/issues?id=suspected_fraud');
    await expect(page.getByText('not established legal fraud')).toBeVisible();
    await expect(page.getByText('I was a victim of fraud.', { exact: false }).first()).toBeVisible();
    pass('issue screen renders actual synthetic quote and suspected-fraud disclosure');
    await page.goto(base + '/decisions');
    await expect(page.getByText('Methodology Version: priority-v1')).toBeVisible();
    for (const [objective, label] of [['experience', 'Customer Experience'], ['operations', 'Operational Reliability'], ['safety', 'Safety & Risk Prioritization']]) {
      const waiting = page.waitForResponse(response => response.url().includes(`/api/decisions?objective=${objective}`));
      await page.getByRole('button', { name: label, exact: true }).click();
      const response = DecisionsResponse.parse(await (await waiting).json());
      await expect(page.getByText(`Ranked Issues for ${objective.toUpperCase()}`, { exact: false })).toBeVisible();
      assert.deepEqual(await page.locator('h3').allTextContents(), response.data.rankedIssues.map(issue => issue.title));
    }
    const decisions = DecisionsResponse.parse(await get('/api/decisions?objective=safety'));
    await page.getByRole('button', { name: 'Open Simulation Sliders' }).click();
    await expect(page.getByText('Hypothetical · Not an observed outcome')).toBeVisible();
    await page.getByLabel('Simulation severity weight').fill('10'); await page.getByLabel('Simulation pattern weight').fill('70');
    const simulated = simulatePriorities(decisions.data.rankedIssues, 10, 70);
    assert.deepEqual(await page.getByTestId('simulation-result').locator('a').allTextContents(), simulated.map((result, index) => `#${index + 1} ${result.title}`));
    pass('three objective switches match live API rankings; simulation explicitly hypothetical');
    await page.goto(base + '/reports');
    await expect(page.getByText('Executive Feedback Intelligence Briefing')).toBeVisible();
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download CSV Export' }).click();
    const download = await downloadEvent; const csvPath = resolve(output, 'download.csv'); await download.saveAs(csvPath);
    const csvResponse = await fetch(base + '/api/reports/export?format=csv'); assert.equal(csvResponse.status, 200);
    const csv = await csvResponse.text(); assert.equal(readFileSync(csvPath, 'utf8'), csv); assert.match(csv, /Not independent customers/);
    sizes.push({ path: '/api/reports/export?format=csv', bytes: Buffer.byteLength(csv) });
    await page.getByRole('button', { name: 'Print Report (PDF)' }).click();
    assert.equal(await page.evaluate(() => (window as unknown as { previewPrintCalls: number }).previewPrintCalls), 1);
    await page.emulateMedia({ media: 'print' }); await expect(page.getByRole('navigation')).toBeHidden();
    await page.pdf({ path: resolve(output, 'report.pdf'), format: 'A4', printBackground: true }); await page.emulateMedia({ media: 'screen' });
    pass('real CSV download equals backend export; report print invocation, print CSS and PDF generation');
    const routes = [['/', 'Command Center'], ['/feedback', 'Feedback Explorer'], ['/issues', 'Issue Intelligence'], ['/decisions', 'Decision Studio'], ['/reports', 'Executive Reports'], ['/data-lab', 'Data Lab']];
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [path, title] of routes) {
        const navigation = await page.goto(base + path); assert.equal(navigation?.status(), 200);
        await expect(page.getByRole('heading', { name: title, exact: false }).first()).toBeVisible();
        const sourceBadge = page.getByText('Development fixture (10 rows · 9 patterns)', { exact: true });
        await expect(sourceBadge).toHaveCount(1);
        if (width >= 768) await expect(sourceBadge).toBeVisible();
        await expect(page.locator('footer').getByText('fixture · heuristic-v2 · Contract 1.0.0', { exact: true })).toBeVisible();
        if (path === '/') await expect(page.getByText('Development Fixture Active', { exact: true })).toBeVisible();
        if (path === '/reports') await expect(page.getByText('Executive Feedback Intelligence Briefing')).toBeVisible();
        if (path === '/data-lab') {
          if (process.env.SMOKE_COMPLETED_PILOT === 'true') {
            const section = page.getByRole('region', { name: 'Adaption Adaptive Data — Completed Synthetic Pilot', exact: true });
            await expect(section).toBeVisible();
            await expect(section.getByText('0/25', { exact: true })).toBeVisible();
            await expect(section.getByRole('table', { name: 'Independent synthetic pilot agreement' })).toBeVisible();
            await expect(section.getByText(/Provider grading declined: 10.0 → 9.2/)).toBeVisible();
            await section.getByText('Actual run provenance and limitations', { exact: true }).click();
            await expect(section.getByText('dataset-cdfeaf20-f5ae-4bba-adec-d420f877e902-1791804602894', { exact: true })).toBeVisible();
            await expect(section.getByText(/no deployed trained classifier/)).toBeVisible();
            await expect(page.getByText('No Adaption run or evaluation is recorded for this selected batch.', { exact: true })).toBeVisible();
          }
          await expect(page.getByText('Official-source verification unavailable for this batch')).toBeVisible();
          await expect(page.getByText('Recorded credits: unavailable')).toBeVisible();
          await expect(page.getByText('Stored run provenance only. External account balance and unrecorded activity are unavailable.')).toBeVisible();
        }
        assert(!(await page.locator('main').textContent())?.includes('7,000'));
        const size = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth }));
        assert(size.body <= size.viewport + 1, `${path} at ${width}px overflows`);
        const link = page.getByRole('navigation').getByRole('link', { name: 'data-lab', exact: true });
        await link.scrollIntoViewIfNeeded(); await expect(link).toBeInViewport();
        if (width === 375 || width === 1440) await page.screenshot({ path: resolve(output, `${path === '/' ? 'overview' : path.slice(1)}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
    }
    pass('six real screens at 320/375/768/1440px, truthful fixture labels, reachable navigation, no horizontal overflow');
    assert.deepEqual(errors, []); assert(sizes.every(item => item.bytes < 4_500_000));
    pass('zero browser page errors; all inspected API/export responses below 4.5 MB');
    writeFileSync(resolve(output, 'audit.json'), JSON.stringify({ baseURL: base, remote: new URL(base).hostname.endsWith('.vercel.app'), testedAt: new Date().toISOString(), checks, responseSizes: sizes, pageErrors: errors, responseMocks: false }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
