import { ExportQuery } from '@/lib/contracts';
import { summarize } from '@/lib/analysis/summary';
import { exportSummary } from '@/lib/analysis/export';
import { handle, query, snapshot } from '@/lib/db/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const { batchId } = query(request, ExportQuery);
    const { records, patterns, meta } = await snapshot(batchId);
    return new Response(exportSummary(summarize(records, patterns), meta), { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="insightflow-summary.csv"', 'Cache-Control': 'private, no-store',
    } });
  });
}
