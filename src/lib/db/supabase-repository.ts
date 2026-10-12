import 'server-only';
import { z } from 'zod';
import { FeedbackRecord, Action, Issue, AdaptionRun, type MetaType, type ObjectiveType } from '@/lib/contracts';
import { groupRecords } from '@/lib/analysis/ingest';
import { buildIssues } from '@/lib/analysis/issues';
import { requireSession } from './auth';
import { HttpError } from './errors';
import type { FeedbackSnapshot } from './repository';
export async function rpc<T>(client: Awaited<ReturnType<typeof requireSession>>['client'], name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === '42501') throw new HttpError(403, 'FORBIDDEN', 'Workspace access denied');
    if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND', 'Requested resource not found');
    if (error.code === '22023' || error.code === '23514') throw new HttpError(400, 'INVALID_BODY', 'Invalid persistence payload');
    if (error.code === 'PGRST202' || error.code === '42883') throw new HttpError(503, 'NOT_CONFIGURED', 'Required database migration is not applied');
    throw new HttpError(500, 'INTERNAL_ERROR', 'Persistence operation failed');
  }
  return data as T;
}
export function privateMeta(batchId: string, source: 'manual' | 'upload'): MetaType {
  return { contractVersion: '1.0.0', mode: 'database', batchId, dataSourceStatus: 'ready', analysisStatus: 'partial',
    provenance: { source, label: 'Authenticated private Supabase workspace', methodologyVersion: 'heuristic-v2' },
    limitations: ['Private owner-scoped data; no inferred customer counts.', 'Import dates are not complaint dates.', 'Heuristic analysis is unreviewed; no Adaption results.'] };
}
export async function privateSnapshot(batchId?: string, issueId?: string): Promise<FeedbackSnapshot | null> {
  const { client } = await requireSession();
  const result = await rpc<unknown>(client, issueId ? 'read_feedback_issue_batch' : 'read_feedback_batch', issueId ? { p_issue_id: issueId } : { p_batch_id: batchId ?? null });
  if (!result) return null;
  const payload = z.object({ batchId: z.uuid(), source: z.enum(['manual','upload']), records: z.array(FeedbackRecord), issues: z.array(Issue), actions: z.array(Action), adaptionRuns: z.array(AdaptionRun) }).parse(result);
  return { records: payload.records, patterns: groupRecords(payload.records), meta: privateMeta(payload.batchId, payload.source), issues: payload.issues, actions: payload.actions, adaptionRuns: payload.adaptionRuns };
}
export function snapshotIssues(snapshot: FeedbackSnapshot, objective: ObjectiveType = 'safety') {
  if (!snapshot.issues) return buildIssues(snapshot.patterns, objective).map(issue => snapshot.analysisCreatedAt ? { ...issue, createdAt: snapshot.analysisCreatedAt, updatedAt: snapshot.analysisCreatedAt } : issue);
  // Persisted issue identity/status retained while scores derive from the same current evidence rules.
  const calculated = buildIssues(snapshot.patterns, objective);
  return snapshot.issues.map(issue => ({ ...issue, priority: calculated.find(i => i.title === issue.title)?.priority ?? issue.priority }))
    .sort((a,b) => b.priority.score - a.priority.score || a.id.localeCompare(b.id));
}
