import { FeedbackQuery, FeedbackResponse } from '@/lib/contracts';
import { normalizeReview } from '@/lib/analysis/ingest';
import { handle, query, snapshot, json } from '@/lib/db/http';
import { manualWrite } from '@/lib/db/writes';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const input = query(request, FeedbackQuery);
    const { records, patterns, meta } = await snapshot(input.batchId);
    const items = (input.view === 'records' ? records : patterns).filter(item => {
      const text = item.kind === 'record' ? item.rawText : item.normalizedText;
      const categoryMatches = !input.category || (item.kind === 'record' ? item.category === input.category : item.categoryCounts[input.category] > 0);
      return normalizeReview(text).includes(normalizeReview(input.q)) && categoryMatches && (!input.sentiment || (item.annotation?.sentiment ?? 'unknown') === input.sentiment);
    });
    const offset = (input.page - 1) * input.pageSize;
    return json(FeedbackResponse, { data: { view: input.view, items: items.slice(offset, offset + input.pageSize) },
      meta: { ...meta, total: items.length, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(items.length / input.pageSize) } });
  });
}
export async function POST(request?: Request) { return manualWrite(request); }
