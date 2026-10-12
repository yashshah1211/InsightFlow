import 'server-only';
import { requireSession } from './auth';
import { HttpError } from './errors';
import { query } from './http';
import { AUTH_HEADERS } from './auth-flow';
import { BatchesQuery, BatchesResponse } from '@/lib/contracts/batches';

export async function listBatches(request: Request) {
  const { client, userId } = await requireSession();
  const { page, pageSize, batchId } = query(request, BatchesQuery);
  // Verified owner filter supplements existing workspace RLS. Never enumerate demo batches.
  let selection = client.from('import_batches')
    .select('id,filename,source,record_count,unique_text_count,rejected_count,created_at', { count: 'exact' })
    .eq('owner_id', userId).eq('status', 'ready').in('source', ['upload', 'manual']);
  if (batchId) selection = selection.eq('id', batchId);
  const { data, count, error } = await selection.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new HttpError(503, 'NOT_CONFIGURED', 'Private batch discovery is unavailable; verify database setup');
  if (!data || count === null) throw new HttpError(503, 'NOT_CONFIGURED', 'Private batch discovery is unavailable');
  const response = BatchesResponse.parse({ data: { items: data.map(row => ({
    id: row.id, filename: row.filename, source: row.source, recordCount: row.record_count,
    uniqueTextCount: row.unique_text_count, rejectedCount: row.rejected_count, createdAt: row.created_at,
  })) }, meta: { contractVersion: 'batches-1.0.0', page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
  return Response.json(response, { headers: AUTH_HEADERS });
}
