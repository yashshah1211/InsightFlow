import { afterEach, expect, it, vi } from 'vitest';
import { deploymentProfile } from '@/lib/db/deployment-profile';
import { supabaseConfig } from '@/lib/db/supabase-config';
import { getRepository } from '@/lib/db';
import { GET as dashboard } from '@/app/api/dashboard/route';
import { GET as feedback } from '@/app/api/feedback/route';
import { DashboardResponse } from '@/lib/contracts';

afterEach(() => vi.unstubAllEnvs());
function preview() {
  vi.stubEnv('INSIGHTFLOW_DEPLOYMENT_PROFILE', 'synthetic-preview');
  vi.stubEnv('INSIGHTFLOW_DATA_MODE', 'fixture');
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED', 'false');
}
it('preview rejects accidental live storage or write configuration', () => {
  preview();
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED', 'true');
  expect(() => deploymentProfile()).toThrow();
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED', 'false');
  vi.stubEnv('INSIGHTFLOW_DATA_MODE', 'official');
  expect(() => getRepository()).toThrow();
  vi.stubEnv('INSIGHTFLOW_DEPLOYMENT_PROFILE', 'unexpected');
  expect(() => deploymentProfile()).toThrow();
});
it('preview ignores injected Supabase configuration and denies private-batch reads', async () => {
  preview();
  vi.stubEnv('SUPABASE_URL', 'https://project.example');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  expect(supabaseConfig()).toBeNull();
  const denied = await feedback(new Request('http://localhost/api/feedback?batchId=11111111-1111-4111-8111-111111111111'));
  expect(denied.status).toBe(401);
  const response = await dashboard(new Request('http://localhost/api/dashboard'));
  const body = DashboardResponse.parse(await response.json());
  expect(body.meta.mode).toBe('fixture');
  expect(body.meta.provenance.source).toBe('fixture');
  expect([body.data.summary.recordCount, body.data.summary.uniqueTextCount, body.data.summary.repeatedRecordCount]).toEqual([10, 9, 1]);
});
it('standard profile preserves configured authenticated workspace support', () => {
  vi.stubEnv('INSIGHTFLOW_DEPLOYMENT_PROFILE', '');
  vi.stubEnv('SUPABASE_URL', 'https://project.example');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  expect(supabaseConfig()).toEqual({ url: 'https://project.example', key: 'public-test-key' });
});
it('authenticated preview permits only the dedicated development target and HTTPS origin', () => {
  vi.stubEnv('INSIGHTFLOW_DEPLOYMENT_PROFILE', 'authenticated-preview');
  vi.stubEnv('INSIGHTFLOW_DATA_MODE', 'fixture');
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED', 'false');
  vi.stubEnv('SUPABASE_URL', `https://${'dbacbcbglbqmqwxscesu'}.supabase.co`);
  vi.stubEnv('APP_ORIGIN', 'https://insightflow-preview-demo.vercel.app');
  expect(deploymentProfile()).toBe('authenticated-preview');
  vi.stubEnv('INSIGHTFLOW_WRITES_ENABLED', 'true');
  expect(deploymentProfile()).toBe('authenticated-preview');
  for (const [name, value] of [
    ['INSIGHTFLOW_DATA_MODE', 'official'], ['INSIGHTFLOW_WRITES_ENABLED', ''],
    ['SUPABASE_URL', 'https://another-project.supabase.co'],
    ['APP_ORIGIN', 'http://insightflow-preview-demo.vercel.app'],
    ['APP_ORIGIN', 'https://insightflow-preview-demo.vercel.app/'],
    ['APP_ORIGIN', 'https://another-app.vercel.app'],
  ]) {
    const original = process.env[name]; vi.stubEnv(name, value);
    expect(() => deploymentProfile()).toThrow(); vi.stubEnv(name, original);
  }
});
