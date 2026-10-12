import { BatchQuery, DashboardResponse } from '@/lib/contracts';
import { summarize } from '@/lib/analysis/summary';
import { snapshotIssues } from '@/lib/db/supabase-repository';
import { handle, query, snapshot, json } from '@/lib/db/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const { batchId } = query(request, BatchQuery);
    const snap = await snapshot(batchId);
    const { records, patterns, meta } = snap;
    return json(DashboardResponse, { data: { summary: summarize(records, patterns), topIssues: snapshotIssues(snap).slice(0, 5) }, meta });
  });
}
