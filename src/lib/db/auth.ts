import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { HttpError } from './errors';
import { authCookieOptions, supabaseConfig } from './supabase-config';
export { supabaseConfig } from './supabase-config';
export async function cookieAuthClient() {
  const config = supabaseConfig();
  if (!config) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is not configured');
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: authCookieOptions(),
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => { for (const { name, value, options } of values) cookieStore.set(name, value, options); } },
  });
}
export async function requireSession(write = false) {
  const config = supabaseConfig();
  if (!config || (write && (process.env.INSIGHTFLOW_WRITES_ENABLED !== 'true' || (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN)))) throw new HttpError(401, 'UNAUTHENTICATED', 'Authenticated persistence is not configured or enabled');
  const client = await cookieAuthClient();
  // getUser revalidates against Auth, including revoked sessions. Never authorize from getSession.
  const { data, error } = await client.auth.getUser();
  if (error || !z.uuid().safeParse(data.user?.id).success) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to access your private workspace');
  return { client, userId: data.user!.id };
}
