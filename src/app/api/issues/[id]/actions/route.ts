import { actionWrite } from '@/lib/db/writes';
export async function POST(request?: Request, context?: { params: Promise<{ id: string }> }) { return actionWrite(request, (await context?.params)?.id); }
