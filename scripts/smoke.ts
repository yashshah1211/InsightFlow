import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { DashboardResponse, FeedbackResponse, IssuesResponse, IssueDetailResponse, DecisionsResponse, DataLabResponse, ErrorResponse } from '../src/lib/contracts';
async function main() {
  const baseURL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
  const cases = [
    ['/api/dashboard', DashboardResponse], ['/api/feedback?view=patterns&pageSize=2', FeedbackResponse],
    ['/api/issues', IssuesResponse], ['/api/issues/suspected_fraud', IssueDetailResponse],
    ['/api/decisions?objective=operations', DecisionsResponse], ['/api/data-lab', DataLabResponse],
  ] as const;
  for (const [path, schema] of cases) {
    const response = await fetch(baseURL + path);
    assert.equal(response.status, 200, path);
    schema.parse(await response.json());
    console.log(`PASS 200 ${path} contract`);
  }
  const exportResponse = await fetch(baseURL + '/api/reports/export?format=csv');
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-type') ?? '', /text\/csv/);
  assert.match(await exportResponse.text(), /Not independent customers/);
  console.log('PASS CSV export provenance');
  const denied = await fetch(baseURL + '/api/feedback/import', { method: 'POST' });
  assert.equal(denied.status, 401);
  ErrorResponse.parse(await denied.json());
  console.log('PASS unauthenticated import denied');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(baseURL);
    await page.getByRole('heading', { name: 'InsightFlow foundation' }).waitFor();
    for (const label of ['feedback', 'issues', 'decisions', 'reports', 'data-lab']) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: label, exact: true }).waitFor();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.getByRole('navigation').isVisible(), true);
    assert.deepEqual(failures, []);
    console.log('PASS Chromium navigation (six pages), mobile navigation, zero page errors');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
