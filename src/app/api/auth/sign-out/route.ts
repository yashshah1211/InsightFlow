import { signOut } from '@/lib/db/auth-flow';
import { handle } from '@/lib/db/http';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handle(() => signOut(request)); }
