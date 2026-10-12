// Shared server configuration; never imported by browser components.
import { deploymentProfile } from './deployment-profile';
export function authCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
}
export function supabaseConfig() {
  if (deploymentProfile() === 'synthetic-preview') return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // A mistaken service key here would bypass SQL RLS. Reject before any request.
  if (key.startsWith('sb_secret_') || key === process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null;
    if (key.split('.').length === 3) {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') return null;
    }
  } catch { return null; }
  return { url, key };
}
