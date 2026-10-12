import { expect, it, vi, afterEach, beforeEach } from 'vitest';
import * as c from '@/lib/contracts';
import { GET as dashboard } from '@/app/api/dashboard/route';
import { GET as feedback, POST as manual } from '@/app/api/feedback/route';
import { GET as issues } from '@/app/api/issues/route';
import { GET as issue, PATCH as patch } from '@/app/api/issues/[id]/route';
import { POST as action } from '@/app/api/issues/[id]/actions/route';
import { POST as upload } from '@/app/api/feedback/import/route';
import { GET as decisions } from '@/app/api/decisions/route';
import { GET as lab } from '@/app/api/data-lab/route';
import { GET as report } from '@/app/api/reports/export/route';
import { csvCell } from '@/lib/analysis/export';
const req = (path: string) => new Request(`http://localhost${path}`);
beforeEach(() => vi.stubEnv('INSIGHTFLOW_DATA_MODE', 'fixture'));
afterEach(() => vi.unstubAllEnvs());
it('all implemented read handlers produce valid envelopes with fixture provenance', async () => {
  const cases = [[dashboard, c.DashboardResponse], [feedback, c.FeedbackResponse], [issues, c.IssuesResponse], [decisions, c.DecisionsResponse], [lab, c.DataLabResponse]] as const;
  for (const [handler, schema] of cases) {
    const r = await handler(req('/api/test'));
    expect(r.status).toBe(200);
    const body = schema.parse(await r.json());
    expect(body.meta.mode).toBe('fixture');
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('cache-control')).toContain('private');
  }
  const r = await issue(req('/api/issues/suspected_fraud'), { params: Promise.resolve({ id: 'suspected_fraud' }) });
  const body = c.IssueDetailResponse.parse(await r.json());
  expect(body.data.evidence).toHaveLength(1);
  expect(body.data.evidence[0].samples[0].rawText).toBe('I was a victim of fraud.');
});
it('feedback supports records/patterns, case-folded search, category/sentiment and pagination', async () => {
  const result = c.FeedbackResponse.parse(await (await feedback(req('/api/feedback?view=patterns&q=CHECKOUT&category=Operational%20Issues&pageSize=1'))).json());
  expect(result.meta.total).toBe(1);
  expect(result.data.items[0].kind).toBe('pattern');
  expect(result.data.items[0]).toMatchObject({ occurrenceCount: 2 });
  const filtered = c.FeedbackResponse.parse(await (await feedback(req('/api/feedback?sentiment=mixed'))).json());
  expect(filtered.meta.total).toBe(1);
  const outside = c.FeedbackResponse.parse(await (await feedback(req('/api/feedback?page=999'))).json());
  expect(outside.data.items).toEqual([]);
  expect(outside.meta.total).toBe(10);
});
it.each(['page=0', 'pageSize=101', 'sentiment=happy', 'category=other', 'view=other', 'page=1&page=2', 'unknown=x', 'q=' + 'x'.repeat(201)])('rejects invalid query %s', async query => {
  const response = await feedback(req('/api/feedback?' + query));
  expect(response.status).toBe(400);
  expect(c.ErrorResponse.parse(await response.json()).error.code).toBe('INVALID_QUERY');
});
it('unknown batch/issue returns 404; database selection fails closed', async () => {
  expect((await dashboard(req('/api/dashboard?batchId=unknown'))).status).toBe(404);
  expect((await issue(req('/api/issues/unknown'), { params: Promise.resolve({ id: 'unknown' }) })).status).toBe(404);
  vi.stubEnv('INSIGHTFLOW_DATA_MODE', 'database');
  const r = await dashboard(req('/api/dashboard'));
  expect(r.status).toBe(503);
  expect(c.ErrorResponse.parse(await r.json()).error.code).toBe('NOT_CONFIGURED');
});
it('all writes reject unauthenticated callers before body parsing', async () => {
  for (const handler of [manual, upload, patch, action]) {
    const r = await handler();
    expect(r.status).toBe(401);
    expect(c.ErrorResponse.parse(await r.json()).error.code).toBe('UNAUTHENTICATED');
  }
});
it('future write request schemas reject unsupported/empty updates and validate limits', () => {
  expect(c.ManualFeedbackRequest.safeParse({ review: ' ', category: 'Fraud and Scam' }).success).toBe(false);
  expect(c.ManualFeedbackRequest.parse({ review: 'text', category: 'Product Feedback' }).observedAt).toBeNull();
  expect(c.IssuePatchRequest.safeParse({}).success).toBe(false);
  expect(c.IssuePatchRequest.safeParse({ status: 'closed' }).success).toBe(false);
  expect(c.ActionRequest.safeParse({ description: 'x', ownerId: 'caller-owner' }).success).toBe(false);
  expect(c.ImportFileMetadata.safeParse({ filename: 'x.csv', size: c.MAX_CSV_BYTES + 1, contentType: 'text/csv' }).success).toBe(false);
});
it('Data Lab reports no invented Adaption metrics or runs', async () => {
  const body = c.DataLabResponse.parse(await (await lab(req('/api/data-lab'))).json());
  expect(body.data.adaption).toMatchObject({ status: 'not_configured', runs: [], evaluation: { status: 'unavailable', value: null } });
  expect(body.data.officialDatasetAssertions).toBe('pending');
});
it('CSV report carries honest denominators, escapes cells and neutralizes formula injection', async () => {
  const response = await report(req('/api/reports/export?format=csv'));
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(await response.text()).toContain('Not independent customers');
  expect(csvCell('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');
  expect(csvCell('  +evil')).toBe('"\'  +evil"');
  expect((await report(req('/api/reports/export?format=pdf'))).status).toBe(400);
});
