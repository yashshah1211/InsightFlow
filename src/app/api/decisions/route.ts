import { DecisionsQuery, DecisionsResponse } from '@/lib/contracts';
import { snapshotIssues } from '@/lib/db/supabase-repository';
import { PRIORITY_VERSION } from '@/lib/analysis/priority';
import { handle, query, snapshot, json } from '@/lib/db/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const { batchId, objective } = query(request, DecisionsQuery);
    const snap = await snapshot(batchId);
    return json(DecisionsResponse, { data: { objective, rankedIssues: snapshotIssues(snap, objective), methodologyVersion: PRIORITY_VERSION }, meta: snap.meta });
  });
}
