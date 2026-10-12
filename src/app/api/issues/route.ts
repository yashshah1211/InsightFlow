import { IssuesQuery, IssuesResponse } from '@/lib/contracts';
import { snapshotIssues } from '@/lib/db/supabase-repository';
import { handle, query, snapshot, json } from '@/lib/db/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const input = query(request, IssuesQuery);
    const snap = await snapshot(input.batchId);
    return json(IssuesResponse, { data: { items: snapshotIssues(snap).filter(i => !input.status || i.status === input.status) }, meta: snap.meta });
  });
}
