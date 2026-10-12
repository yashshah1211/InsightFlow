import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { DashboardResponse, FeedbackResponse, DataLabResponse, DecisionsResponse, IssueDetailResponse, ErrorResponse } from '../src/lib/contracts';
import { simulatePriorities } from '../src/lib/analysis/simulation';

const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3100';
const output = resolve('artifacts/release');
mkdirSync(output, { recursive: true });
const checks: string[] = [];
function pass(message: string) { checks.push(message); console.log('PASS', message); }
async function get(path: string) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  return response.json();
}
async function feedbackAfter(page: Page, action: () => Promise<unknown>) {
  const waiting = page.waitForResponse(response => new URL(response.url()).pathname === '/api/feedback' && response.request().method() === 'GET');
  await action();
  const response = await waiting;
  assert.equal(response.status(), 200);
  const body = FeedbackResponse.parse(await response.json());
  await expect(page.getByRole('button', { name: /^Inspect (record|pattern)/ }).first()).toBeVisible();
  return body;
}

async function main() {
  const dashboard = DashboardResponse.parse(await get('/api/dashboard'));
  const lab = DataLabResponse.parse(await get('/api/data-lab'));
  assert.equal(dashboard.meta.provenance.source, 'official_csv');
  assert.deepEqual([dashboard.data.summary.recordCount, dashboard.data.summary.uniqueTextCount, dashboard.data.summary.repeatedRecordCount, lab.data.top20RecordCount], [7000, 320, 6680, 5025]);
  assert.equal(dashboard.data.summary.timestampCoverage.covered, 0);
  assert.deepEqual(dashboard.data.summary.annotationCoverage, { covered: 102, total: 320, ratio: 102 / 320, basis: 'patterns' });
  const patterns = [];
  for (let page = 1; page <= 4; page++) {
    const body = FeedbackResponse.parse(await get(`/api/feedback?view=patterns&pageSize=100&page=${page}`));
    for (const item of body.data.items) { assert.equal(item.kind, 'pattern'); if (item.kind === 'pattern') patterns.push(item); }
  }
  assert.equal(Math.max(...patterns.map(pattern => pattern.occurrenceCount)), 295);
  assert.equal(patterns.reduce((sum, pattern) => sum + pattern.occurrenceCount, 0), 7000);
  pass('official API invariants, occurrence maximum 295, coverage denominator 320, no complaint dates');
  for (const path of ['/api/feedback?page=0', '/api/feedback?pageSize=101', '/api/feedback?sentiment=invalid', '/api/feedback?q=a&q=b', '/api/dashboard?unexpected=1', '/api/decisions?objective=invalid', '/api/issues?status=invalid', '/api/reports/export?format=pdf']) {
    const response = await fetch(base + path); assert.equal(response.status, 400); ErrorResponse.parse(await response.json());
  }
  for (const [path, method] of [['/api/feedback', 'POST'], ['/api/feedback/import', 'POST'], ['/api/issues/suspected_fraud', 'PATCH'], ['/api/issues/suspected_fraud/actions', 'POST']]) {
    const response = await fetch(base + path, { method }); assert.equal(response.status, 401); ErrorResponse.parse(await response.json());
  }
  pass('invalid/duplicate queries rejected; all four unauthenticated writes return 401');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Object.assign(window, { releasePrintCalls: 0 }); window.print = () => { const w = window as unknown as { releasePrintCalls: number }; w.releasePrintCalls++; }; });
    await page.goto(base + '/feedback');
    await expect(page.getByRole('button', { name: /^Inspect record/ }).first()).toBeVisible();
    let body = await feedbackAfter(page, () => page.getByRole('button', { name: 'Distinct Patterns View', exact: true }).click());
    assert.equal(body.meta.total, 320);
    const first = body.data.items[0]; assert.equal(first.kind, 'pattern');
    if (first.kind === 'pattern') {
      await expect(page.getByText(`${first.occurrenceCount} occurrences`, { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: /^Inspect pattern/ }).first().click();
      await expect(page.getByRole('dialog', { name: 'Feedback evidence' }).getByText(first.exampleOriginalText, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close detail drawer' }).click();
    }
    body = await feedbackAfter(page, () => page.getByRole('button', { name: 'Next', exact: true }).click());
    assert.equal(body.meta.page, 2);
    body = await feedbackAfter(page, () => page.getByLabel('Category filter').selectOption('Operational Issues'));
    assert.equal(body.meta.page, 1); assert.equal(body.meta.total, 36);
    body = await feedbackAfter(page, () => page.getByLabel('Sentiment filter').selectOption('unknown'));
    assert(body.data.items.every(item => item.annotation?.sentiment === 'unknown' || item.annotation === null));
    await feedbackAfter(page, () => page.getByLabel('Category filter').selectOption(''));
    await feedbackAfter(page, () => page.getByLabel('Sentiment filter').selectOption(''));
    await page.getByLabel('Search review text').fill('not a victim of fraud');
    body = await feedbackAfter(page, () => page.getByRole('button', { name: 'Search', exact: true }).click());
    assert(body.data.items.every(item => !item.annotation?.issueTypes.includes('suspected_fraud')));
    body = await feedbackAfter(page, () => page.getByRole('button', { name: 'Search', exact: true }).click());
    assert(body.meta.total > 0); // repeated identical searches must not leave loading stuck
    await page.getByLabel('Search review text').fill('no-match-release-audit-xyz');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No matching feedback found')).toBeVisible();
    await feedbackAfter(page, () => page.getByRole('button', { name: 'Clear', exact: true }).click());
    pass('records/patterns, real badges/drawer evidence, pagination, filters, negation search, same-query retry and empty state');

    await page.route('**/api/feedback?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_CONFIGURED', message: 'Release test: temporary outage' } }) }));
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Release test: temporary outage/)).toBeVisible();
    await page.unroute('**/api/feedback?**');
    await feedbackAfter(page, () => page.getByRole('button', { name: 'Retry', exact: true }).click());
    pass('explicit simulated API failure and successful recovery');

    await page.getByRole('button', { name: 'Add Record', exact: true }).first().click();
    const manual = page.getByRole('dialog', { name: 'Add manual feedback', exact: true });
    await manual.locator('textarea').fill('Release audit test input; not official competition data.');
    const manualRequest = page.waitForResponse(response => new URL(response.url()).pathname === '/api/feedback' && response.request().method() === 'POST');
    await manual.getByRole('button', { name: 'Save Feedback', exact: true }).click();
    assert.equal((await manualRequest).status(), 401);
    await expect(manual.getByText('401 UNAUTHENTICATED — Authenticated Storage Required')).toBeVisible();
    await expect(manual.getByText('Feedback Created Successfully')).toHaveCount(0);
    await manual.getByRole('button', { name: 'Close manual feedback' }).click();
    await page.getByRole('button', { name: 'Import CSV', exact: true }).first().click();
    const importer = page.getByRole('dialog', { name: 'Import feedback CSV', exact: true });
    await importer.locator('input[type=file]').setInputFiles({ name: 'release-test.csv', mimeType: 'text/csv', buffer: Buffer.from('review,category\nRelease audit test input,Product Feedback\n') });
    const importRequest = page.waitForResponse(response => new URL(response.url()).pathname === '/api/feedback/import');
    await importer.getByRole('button', { name: 'Upload & Process CSV' }).click();
    assert.equal((await importRequest).status(), 401);
    await expect(importer.getByText(/401 UNAUTHENTICATED/)).toBeVisible();
    await expect(importer.getByText('Import Complete', { exact: true })).toHaveCount(0);
    await importer.getByRole('button', { name: 'Close CSV import' }).click();
    assert.equal(DashboardResponse.parse(await get('/api/dashboard')).data.summary.recordCount, 7000);
    pass('real manual/import dialog requests denied with 401, no success UI, public dataset unchanged');

    await page.goto(base + '/issues?id=missing-issue');
    await expect(page.getByRole('heading', { name: 'Issue evidence unavailable' })).toBeVisible();
    await page.getByRole('button', { name: /^Inspect issue/ }).first().click();
    await expect(page.getByText('Supporting Evidence Quotes & Pattern Groups')).toBeVisible();
    const issue = IssueDetailResponse.parse(await get('/api/issues/suspected_fraud'));
    await page.goto(base + '/issues?id=suspected_fraud');
    await expect(page.getByText('not established legal fraud')).toBeVisible();
    for (const evidence of issue.data.evidence) {
      assert(evidence.samples.every(sample => sample.normalizedHash === evidence.pattern.normalizedHash));
      await expect(page.getByText(evidence.pattern.exampleOriginalText, { exact: false }).first()).toBeVisible();
    }
    await page.getByRole('button', { name: 'Save Status Update' }).click();
    await expect(page.getByText('401 UNAUTHENTICATED', { exact: true })).toBeVisible();
    await page.getByPlaceholder('e.g. Conduct review of payment gateway...').fill('Release audit action');
    await page.getByRole('button', { name: 'Log Tracking Action' }).click();
    await expect(page.getByText('401 UNAUTHENTICATED', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Resolved', exact: true }).click();
    await expect(page.getByText('No issue selected for this filter.')).toBeVisible();
    pass('unknown issue error, genuine evidence alignment, suspected-fraud disclosure, denied status/action saves and empty issue filter');

    await page.goto(base + '/decisions');
    await expect(page.getByText('Methodology Version: priority-v1')).toBeVisible();
    for (const [objective, label] of [['experience', 'Customer Experience'], ['operations', 'Operational Reliability'], ['safety', 'Safety & Risk Prioritization']]) {
      const waiting = page.waitForResponse(response => response.url().includes(`/api/decisions?objective=${objective}`));
      await page.getByRole('button', { name: label, exact: true }).click();
      const response = DecisionsResponse.parse(await (await waiting).json());
      await expect(page.getByText(`Ranked Issues for ${objective.toUpperCase()}`, { exact: false })).toBeVisible();
      const rendered = await page.locator('h3').allTextContents();
      assert.deepEqual(rendered, response.data.rankedIssues.map(issue => issue.title));
    }
    const decisions = DecisionsResponse.parse(await get('/api/decisions?objective=safety'));
    await page.getByRole('button', { name: 'Open Simulation Sliders' }).click();
    await expect(page.getByText('Hypothetical · Not an observed outcome')).toBeVisible();
    await page.getByLabel('Simulation severity weight').fill('10');
    await page.getByLabel('Simulation pattern weight').fill('70');
    const simulated = simulatePriorities(decisions.data.rankedIssues, 10, 70);
    await expect(page.getByTestId('simulation-result')).toHaveCount(simulated.length);
    assert.deepEqual(await page.getByTestId('simulation-result').locator('a').allTextContents(), simulated.map((result, index) => `#${index + 1} ${result.title}`));
    for (const result of simulated) await expect(page.getByText(`Hypothetical: ${result.score.toFixed(2)} · Server: ${result.serverScore.toFixed(2)}`, { exact: true }).first()).toBeVisible();
    pass('three objectives render API ranking; sliders calculate labeled hypothetical scores without changing server results');

    await page.goto(base + '/reports');
    await expect(page.getByText('Executive Feedback Intelligence Briefing')).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV Export' }).click();
    const download = await downloadEvent; const downloadPath = resolve(output, 'download.csv'); await download.saveAs(downloadPath);
    assert.equal(readFileSync(downloadPath, 'utf8'), await (await fetch(base + '/api/reports/export?format=csv')).text());
    await page.getByRole('button', { name: 'Print Report (PDF)' }).click();
    assert.equal(await page.evaluate(() => (window as unknown as { releasePrintCalls: number }).releasePrintCalls), 1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation')).toBeHidden();
    await page.pdf({ path: resolve(output, 'executive-report.pdf'), format: 'A4', printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    pass('CSV download equals backend export; browser print invoked, print CSS verified and actual PDF captured');

    await page.route('**/api/reports/export?format=csv', route => route.fulfill({ status: 503, json: { error: { code: 'NOT_CONFIGURED', message: 'Release test: export unavailable' } } }));
    await page.goto(base + '/reports');
    await expect(page.getByText('Export preview unavailable (503)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print Report (PDF)' })).toBeDisabled();
    await expect(page.getByText('Executive Feedback Intelligence Briefing')).toHaveCount(0);
    await page.unroute('**/api/reports/export?format=csv');
    await page.getByRole('button', { name: 'Retry report' }).click();
    await expect(page.getByText('Executive Feedback Intelligence Briefing')).toBeVisible();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/feedback?**', async route => { await blocked; await route.continue(); });
    await page.goto(base + '/feedback');
    await expect(page.getByText('Loading feedback data...')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Inspect record/ })).toHaveCount(0);
    release();
    await expect(page.getByRole('button', { name: /^Inspect record/ }).first()).toBeVisible();
    await page.unroute('**/api/feedback?**');
    pass('explicit delayed-response loading state; failed export cannot render/print a fabricated report; report retry recovers');

    const routes = [ ['/', 'Command Center'], ['/feedback', 'Feedback Explorer'], ['/issues', 'Issue Intelligence'], ['/decisions', 'Decision Studio'], ['/reports', 'Executive Reports'], ['/data-lab', 'Data Lab'] ];
    const screenshots: string[] = [];
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 900 : 1000 });
      for (const [path, title] of routes) {
        await page.goto(base + path);
        await expect(page.getByRole('heading', { name: title, exact: false }).first()).toBeVisible();
        await expect(page.getByText('Official CSV · Read-only artifact', { exact: true })).toBeVisible();
        if (path === '/reports') await expect(page.getByText('Executive Feedback Intelligence Briefing')).toBeVisible();
        if (path === '/issues') await expect(page.getByText('Supporting Evidence Quotes & Pattern Groups')).toBeVisible();
        if (path === '/') {
          const unknown = page.getByText('Unknown (Heuristic unassigned):', { exact: true });
          await expect(unknown).toBeVisible();
          const legend = unknown.locator('..');
          assert((await legend.textContent())?.includes('218'));
          const clipping = await legend.evaluate(element => ({ visible: element.clientWidth, content: element.scrollWidth }));
          assert(clipping.content <= clipping.visible + 1, 'Unknown sentiment count must not be clipped');
        }
        const size = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth }));
        assert(size.body <= size.viewport + 1, `${path} at ${width}px overflows to ${size.body}px`);
        const nav = page.getByRole('navigation');
        await nav.getByRole('link', { name: 'data-lab', exact: true }).scrollIntoViewIfNeeded();
        await expect(nav.getByRole('link', { name: 'data-lab', exact: true })).toBeInViewport();
        if (width === 375 || width === 1440) {
          await nav.getByRole('link', { name: path === '/' ? 'Overview' : path.slice(1), exact: true }).scrollIntoViewIfNeeded();
          await page.evaluate(() => scrollTo(0, 0));
          const pathName = path === '/' ? 'command-center' : path.slice(1);
          const shot = resolve(output, `${pathName}-${width}.png`);
          await page.screenshot({ path: shot.replace('.png', '-full.png'), fullPage: true, animations: 'disabled' });
          await page.screenshot({ path: shot, fullPage: false, animations: 'disabled' }); screenshots.push(shot);
        }
      }
    }
    pass('six pages at 320/375/768/1440px, no document overflow; mobile navigation reachable; 12 screenshots');
    // Explicitly mocked fixture responses prove UI labels do not assume the official dataset.
    const examples = JSON.parse(readFileSync('docs/api-examples.json', 'utf8'));
    await page.route('**/api/dashboard', route => route.fulfill({ json: examples.dashboard }));
    await page.route('**/api/data-lab', route => route.fulfill({ json: examples.dataLab }));
    await page.goto(base + '/');
    await expect(page.getByText('Development Fixture Active', { exact: true })).toBeVisible();
    await expect(page.getByText('Development fixture (10 rows · 9 patterns)', { exact: true })).toBeVisible();
    assert(!(await page.locator('main').textContent())?.includes('7,000'));
    await page.goto(base + '/data-lab');
    await expect(page.getByText('Official-source verification unavailable for this batch')).toBeVisible();
    await expect(page.getByText('Recorded credits: unavailable')).toBeVisible();
    assert(!(await page.locator('main').textContent())?.includes('6,680'));
    pass('explicit fixture-response tests: real fixture counts, pending official gate and unavailable credit usage');
    assert.deepEqual(errors, []);
    const links = routes.map(([path, title]) => { const name = path === '/' ? 'command-center' : path.slice(1); return `| ${title} | [Desktop](${resolve(output, `${name}-1440.png`).replaceAll('\\', '/')}) | [Mobile](${resolve(output, `${name}-375.png`).replaceAll('\\', '/')}) |`; });
    writeFileSync(resolve(output, 'SCREENSHOTS.md'), '# Production browser captures\n\nChromium screenshots at 1440px and 375px. All six routes also passed at 320px and 768px. Companion `-full.png` files contain full-page captures.\n\n| Screen | 1440px | 375px |\n| --- | --- | --- |\n' + links.join('\n') + '\n');
    writeFileSync(resolve(output, 'audit.json'), JSON.stringify({ baseURL: base, browser: 'Chromium', checks, screenshots, pageErrors: errors, testedAt: new Date().toISOString() }, null, 2));
    pass('zero browser page errors; audit saved under artifacts/release');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
