import { callback } from '@/lib/db/auth-flow';
import { handle } from '@/lib/db/http';
export const runtime = 'nodejs';
export async function GET(request: Request) { return handle(() => callback(request)); }
