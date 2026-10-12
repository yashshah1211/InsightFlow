import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieOptions, supabaseConfig } from '@/lib/db/supabase-config';
// API-only refresh boundary; UI integration belongs to Antigravity.
export async function proxy(request: NextRequest) {
  const settings = supabaseConfig();
  if (!settings || !request.cookies.getAll().some(c => c.name.startsWith('sb-'))) return NextResponse.next();
  const { url, key } = settings;
  let response = NextResponse.next({ request });
  const client = createServerClient(url,key,{
    cookieOptions: authCookieOptions(),
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:(values, headers)=>{
      const previous = response.cookies.getAll();
      for (const {name,value} of values) request.cookies.set(name,value);
      response=NextResponse.next({request});
      for (const cookie of previous) response.cookies.set(cookie);
      for (const {name,value,options} of values) response.cookies.set(name,value,options);
      for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
    },
  }});
  try { await client.auth.getClaims(); }
  catch { /* Authenticated handlers fail closed via getUser; read-only demo remains available. */ }
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Pragma','no-cache');
  response.headers.set('Expires','0');
  return response;
}
export const config = { matcher: ['/api/:path*'] };
