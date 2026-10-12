import { afterEach, expect, it, vi } from 'vitest';
import { patchIssue, fetchDashboard } from '@/components/api-client';
afterEach(() => vi.unstubAllGlobals());
function response(status: number, body: string, url: string) {
  const result = new Response(body, { status });
  Object.defineProperty(result, 'url', { value: url });
  const dispatch = vi.fn();
  vi.stubGlobal('window', { dispatchEvent: dispatch });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result));
  return dispatch;
}
const denied = JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Authenticated persistence is not configured or enabled' } });
it('mutation 401 requests verified session recheck without assuming logout from disabled writes', async () => {
  const dispatch = response(401, denied, 'https://app.example/api/issues/private-id');
  await expect(patchIssue('private-id', { status: 'planned' })).rejects.toMatchObject({ statusCode: 401 });
  expect(dispatch.mock.calls.map(call => call[0].type)).toEqual(['insightflow:verify-session']);
});
it('private read 401 clears session scope immediately', async () => {
  const dispatch = response(401, denied, 'https://app.example/api/dashboard?batchId=private-id');
  await expect(fetchDashboard('private-id')).rejects.toMatchObject({ statusCode: 401 });
  expect(dispatch.mock.calls.map(call => call[0].type)).toEqual(['insightflow:session-expired']);
});
it('platform non-JSON failure reports status without reflecting response contents', async () => {
  response(413, 'test-only sensitive platform diagnostics', 'https://app.example/api/dashboard');
  await expect(fetchDashboard()).rejects.toMatchObject({ statusCode: 413, message: 'Request failed with status 413; response unavailable' });
});
