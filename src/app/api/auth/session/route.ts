import { session } from '@/lib/db/auth-flow';
import { handle } from '@/lib/db/http';
export const runtime = 'nodejs';
export async function GET() { return handle(session); }
