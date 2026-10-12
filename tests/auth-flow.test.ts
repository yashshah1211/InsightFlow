import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), exchange: vi.fn(), getClaims: vi.fn(), set: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: mocks.set }) }));
import { signIn, signOut, callback, session } from '@/lib/db/auth-flow';
import { supabaseConfig } from '@/lib/db/supabase-config';
import { proxy } from '@/proxy';
const id = '11111111-1111-4111-8111-111111111111';
function request(body: unknown, origin = 'https://app.example') {
  return new Request('https://app.example/api/auth/sign-in', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://project.example');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('APP_ORIGIN', 'https://app.example');
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser, signInWithPassword: mocks.signIn, signOut: mocks.signOut, exchangeCodeForSession: mocks.exchange, getClaims: mocks.getClaims } });
  mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it('password sign-in verifies Auth and exposes only verified UUID with no-store headers', async () => {
  mocks.signIn.mockResolvedValue({ data: { user: { id }, session: { access_token: 'test-only-hidden' } }, error: null });
  const response = await signIn(request({ email: 'owner@example.com', password: 'test-only-password' }));
  expect(await response.json()).toEqual({ data: { userId: id }, meta: { contractVersion: 'auth-1.0.0' } });
  expect(response.headers.get('cache-control')).toContain('private');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mocks.getUser).toHaveBeenCalledOnce();
});
it('cross-origin sign-in/sign-out never invokes Auth', async () => {
  await expect(signIn(request({}, 'https://attacker.example'))).rejects.toMatchObject({ status: 403 });
  await expect(signOut(request({}, 'https://attacker.example'))).rejects.toMatchObject({ status: 403 });
  expect(mocks.createServerClient).not.toHaveBeenCalled();
});
it('rejects extra identity fields and wrong credentials without provider details', async () => {
  await expect(signIn(request({ email: 'owner@example.com', password: 'test', ownerId: id }))).rejects.toMatchObject({ status: 400 });
  expect(mocks.signIn).not.toHaveBeenCalled();
  mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'provider secret details' } });
  await expect(signIn(request({ email: 'owner@example.com', password: 'test' }))).rejects.toMatchObject({ status: 401, message: 'Unable to sign in with those credentials' });
});
it('session fails closed for revoked identity and sign-out clears the local Auth session', async () => {
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  await expect(session()).rejects.toMatchObject({ status: 401 });
  mocks.signOut.mockResolvedValue({ error: null });
  const response = await signOut(request({}));
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect((await response.json()).data.userId).toBeNull();
});
it('PKCE callback uses verifier cookies and a fixed relative redirect, rejects replay/provider errors', async () => {
  mocks.exchange.mockResolvedValue({ error: null });
  const response = await callback(new Request('https://app.example/api/auth/callback?code=actual-code-test'));
  expect(mocks.exchange).toHaveBeenCalledWith('actual-code-test');
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/');
  expect(response.headers.get('cache-control')).toContain('no-store');
  mocks.exchange.mockResolvedValue({ error: { message: 'expired' } });
  await expect(callback(new Request('https://app.example/api/auth/callback?code=used-code'))).rejects.toMatchObject({ status: 401 });
});
it('callback rejects duplicate codes and redirect injection before contacting Auth', async () => {
  for (const query of ['code=a&code=b', 'code=a&next=https://attacker.example', '']) await expect(callback(new Request('https://app.example/api/auth/callback?' + query))).rejects.toMatchObject({ status: 400 });
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it('service-role keys are rejected even if accidentally assigned to the publishable variable', () => {
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_secret_test');
  expect(supabaseConfig()).toBeNull();
  const encoded = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', `header.${encoded}.signature`);
  expect(supabaseConfig()).toBeNull();
});
it('refresh preserves multiple cookie writes on request and response and disables CDN caching', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  mocks.getClaims.mockImplementation(async () => {
    const options = mocks.createServerClient.mock.calls[0][2];
    options.cookies.setAll([{ name: 'sb-first', value: 'one', options: { path: '/' } }], { Pragma: 'no-cache', Expires: '0' });
    options.cookies.setAll([{ name: 'sb-second', value: 'two', options: { path: '/' } }], {});
    return { data: null, error: null };
  });
  const req = new NextRequest('https://app.example/api/dashboard', { headers: { Cookie: 'sb-session=test' } });
  const response = await proxy(req);
  expect(response.cookies.get('sb-first')?.value).toBe('one');
  expect(response.cookies.get('sb-second')?.value).toBe('two');
  expect(req.cookies.get('sb-second')?.value).toBe('two');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  expect(mocks.createServerClient.mock.calls[0][2].cookieOptions).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
});
it('refresh outage preserves public reads; authorization remains independent', async () => {
  mocks.getClaims.mockRejectedValue(new Error('test-only outage'));
  const response = await proxy(new NextRequest('https://app.example/api/dashboard', { headers: { Cookie: 'sb-session=forged' } }));
  expect(response.status).toBe(200);
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'forged' } });
  await expect(session()).rejects.toMatchObject({ status: 401 });
});
