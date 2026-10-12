import { listBatches } from '@/lib/db/batches';
import { handle } from '@/lib/db/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handle(() => listBatches(request)); }
