import 'server-only';
import { z } from 'zod';
import { cookieAuthClient, requireSession } from './auth';
import { jsonBody, verifyOrigin } from './body';
import { HttpError } from './errors';
import { SignInRequest, AuthSessionResponse } from '@/lib/contracts/auth';

export const AUTH_HEADERS = { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' };
function authJson(userId: string | null) {
  return Response.json(AuthSessionResponse.parse({ data: { userId }, meta: { contractVersion: 'auth-1.0.0' } }), { headers: AUTH_HEADERS });
}
function authOrigin(request: Request) {
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN) throw new HttpError(503, 'NOT_CONFIGURED', 'Authentication requires APP_ORIGIN');
  verifyOrigin(request);
}
export async function signIn(request: Request) {
  authOrigin(request);
  // Validate configuration before reading a password; no application password storage.
  const client = await cookieAuthClient();
  const credentials = await jsonBody(request, SignInRequest);
  const result = await client.auth.signInWithPassword(credentials);
  if (result.error || !z.uuid().safeParse(result.data.user?.id).success) throw new HttpError(401, 'UNAUTHENTICATED', 'Unable to sign in with those credentials');
  // Authorization uses Auth verification, never a decoded client session.
  const { userId } = await requireSession();
  return authJson(userId);
}
export async function session() {
  return authJson((await requireSession()).userId);
}
export async function signOut(request: Request) {
  authOrigin(request);
  const { client } = await requireSession();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw new HttpError(503, 'NOT_CONFIGURED', 'Unable to end session; retry');
  return authJson(null);
}
export async function callback(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== 'code') || params.getAll('code').length !== 1 || !params.get('code') || params.get('code')!.length > 2048) throw new HttpError(400, 'INVALID_QUERY', 'Expected one authentication code');
  const client = await cookieAuthClient();
  const { error } = await client.auth.exchangeCodeForSession(params.get('code')!);
  if (error) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication link expired or invalid');
  await requireSession();
  // Relative, fixed destination: no Host header or caller-supplied redirect target.
  return new Response(null, { status: 303, headers: { ...AUTH_HEADERS, Location: '/' } });
}
