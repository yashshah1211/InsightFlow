import { BatchQuery, Id, IssueDetailResponse } from '@/lib/contracts';
import { buildIssues, evidencePatterns, recommendations } from '@/lib/analysis/issues';
import { handle, query, snapshot, json, HttpError } from '@/lib/db/http';
import { patchWrite } from '@/lib/db/writes';
import { snapshotIssues, privateSnapshot } from '@/lib/db/supabase-repository';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { batchId } = query(request, BatchQuery);
    const idResult = Id.safeParse((await context.params).id);
    if (!idResult.success) throw new HttpError(400, 'INVALID_QUERY', 'Invalid issue ID');
    const snap = !batchId && z.uuid().safeParse(idResult.data).success ? await privateSnapshot(undefined,idResult.data) : await snapshot(batchId);
    if (!snap) throw new HttpError(404, 'NOT_FOUND', 'Issue not found');
    const { patterns, records, meta } = snap;
    const issue = snapshotIssues(snap).find(i => i.id === idResult.data);
    if (!issue) throw new HttpError(404, 'NOT_FOUND', 'Issue not found');
    const topicKey = buildIssues(patterns).find(i => i.title === issue.title)?.id ?? issue.id;
    return json(IssueDetailResponse, { data: { issue, evidence: evidencePatterns(patterns, topicKey).map(pattern => ({
      role: 'supporting' as const, pattern, samples: records.filter(r => r.normalizedHash === pattern.normalizedHash).slice(0, 3),
    })), recommendations: recommendations(topicKey), actions: (snap.actions ?? []).filter(a => a.issueId === issue.id) }, meta });
  });
}
export async function PATCH(request?: Request, context?: { params: Promise<{ id: string }> }) { return patchWrite(request, (await context?.params)?.id); }
