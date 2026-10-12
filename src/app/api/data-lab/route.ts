import { BatchQuery, DataLabResponse } from '@/lib/contracts';
import { summarize } from '@/lib/analysis/summary';
import { FIXTURE_IMPORTED_AT } from '@/lib/fixtures';
import { handle, query, snapshot, json } from '@/lib/db/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const { batchId } = query(request, BatchQuery);
    const snap = await snapshot(batchId);
    const { records, patterns, meta } = snap;
    const runs = snap.adaptionRuns ?? [];
    return json(DataLabResponse, { data: { summary: summarize(records, patterns),
      imports: [{ batchId: meta.batchId, filename: meta.provenance.source === 'fixture' ? 'feedback.csv' : meta.provenance.source === 'official_csv' ? 'BuildBattle_2026_Customer_Feedback_Dataset.csv' : 'private batch', source: meta.provenance.source, status: 'ready', createdAt: records[0]?.importedAt ?? FIXTURE_IMPORTED_AT }],
      adaption: { status: runs.length ? runs[runs.length-1].status : 'not_configured', runs, evaluation: { status: 'unavailable', value: null, reason: runs.length ? 'No independently verified task-quality evaluation has been published' : 'No Adaption run or evaluation has been performed' } },
      top20RecordCount: [...patterns].sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 20).reduce((n, p) => n + p.occurrenceCount, 0),
      officialDatasetAssertions: meta.provenance.source === 'official_csv' ? 'passed' : 'pending' }, meta });
  });
}
