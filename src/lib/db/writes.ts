import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { ImportResponse, ManualFeedbackRequest, ManualFeedbackResponse, MAX_CSV_BYTES, IssuePatchRequest, IssuePatchResponse, ActionRequest, ActionResponse, ImportFileMetadata, FeedbackRecord } from '@/lib/contracts';
import { parseFeedbackCsv, groupRecords, hashReview, IngestError } from '@/lib/analysis/ingest';
import { annotateHeuristically, validateAnnotationEvidence } from '@/lib/analysis/heuristic';
import { buildIssues, evidencePatterns } from '@/lib/analysis/issues';
import { requireSession } from './auth';
import { rpc, privateMeta } from './supabase-repository';
import { boundedBody, jsonBody, verifyOrigin } from './body';
import { handle, json, rejectWrite, HttpError } from './http';
async function authenticated(request?: Request) {
  const session = await requireSession(true); // Reject before parsing body or origin when unconfigured/unauthenticated.
  if (!request) throw new HttpError(400, 'INVALID_BODY', 'Request required');
  verifyOrigin(request);
  return session;
}
function ingestPayload(records: ReturnType<typeof FeedbackRecord.parse>[], filename: string, source: 'upload' | 'manual', contentHash: string, rejectedRows: {rowNumber:number;reason:string}[]) {
  const patterns = groupRecords(records);
  for (const p of patterns) if (p.annotation && !validateAnnotationEvidence(p.exampleOriginalText,p.annotation)) throw new HttpError(400,'INVALID_BODY','Evidence does not align');
  const issues = buildIssues(patterns).map(issue => ({ ...issue, createdAt: records[0].importedAt, updatedAt: records[0].importedAt, key: issue.id, id: randomUUID(), patterns: evidencePatterns(patterns,issue.id).map(p => p.normalizedHash) }));
  return { batchId: records[0].batchId, records, patterns, issues, filename, source, contentHash, rejectedRows };
}
export async function manualWrite(request?: Request) {
  if (!request && process.env.INSIGHTFLOW_WRITES_ENABLED !== 'true') return rejectWrite();
  return handle(async () => {
    const { client } = await authenticated(request);
    const input = await jsonBody(request!, ManualFeedbackRequest);
    const batchId = randomUUID();
    const record = FeedbackRecord.parse({ kind: 'record', id: randomUUID(), batchId, rowNumber: 1, rawText: input.review, category: input.category,
      normalizedHash: hashReview(input.review), source: 'manual', importedAt: new Date().toISOString(), observedAt: input.observedAt,
      annotation: annotateHeuristically(input.review) });
    // Manual submissions are explicitly independent batches, even when text repeats.
    const payload = ingestPayload([record], 'manual.json', 'manual', createHash('sha256').update(batchId).digest('hex'), []);
    await rpc(client,'import_feedback_batch',{p_payload:payload});
    return json(ManualFeedbackResponse,{ data:record, meta:privateMeta(batchId,'manual') });
  });
}
export async function importWrite(request?: Request) {
  if (!request && process.env.INSIGHTFLOW_WRITES_ENABLED !== 'true') return rejectWrite();
  return handle(async () => {
    const { client } = await authenticated(request);
    const contentType = request!.headers.get('content-type') ?? '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) throw new HttpError(400,'INVALID_BODY','Expected multipart CSV');
    const bytes = await boundedBody(request!,MAX_CSV_BYTES + 64*1024);
    let form: FormData;
    try { form = await new Response(bytes as BodyInit,{headers:{'content-type':contentType}}).formData(); }
    catch { throw new HttpError(400,'INVALID_BODY','Malformed multipart body'); }
    const file = form.get('file');
    if ([...form.keys()].length !== 1 || !(file instanceof File)) throw new HttpError(400,'INVALID_BODY','One file field is required');
    if (file.size > MAX_CSV_BYTES) throw new HttpError(413,'FILE_TOO_LARGE','CSV exceeds 5 MiB');
    if (!ImportFileMetadata.safeParse({filename:file.name,contentType:file.type,size:file.size}).success) throw new HttpError(415,'UNSUPPORTED_FILE','Unsupported CSV file');
    let parsed;
    try { parsed = parseFeedbackCsv(new Uint8Array(await file.arrayBuffer()),{filename:file.name,contentType:file.type}); }
    catch (error) { if (error instanceof IngestError) throw new HttpError(error.code === 'FILE_TOO_LARGE' ? 413 : 400,error.code,error.message); throw error; }
    const batchId = randomUUID();
    const importedAt = new Date().toISOString();
    const records = parsed.accepted.map(row => FeedbackRecord.parse({kind:'record',id:randomUUID(),batchId,...row,normalizedHash:hashReview(row.rawText),source:'upload',
      importedAt,observedAt:null,annotation:annotateHeuristically(row.rawText)}));
    const result = await rpc<unknown>(client,'import_feedback_batch',{p_payload:ingestPayload(records,file.name,'upload',parsed.contentHash,parsed.rejectedRows)});
    const data = ImportResponse.shape.data.parse(result);
    return json(ImportResponse,{data,meta:privateMeta(data.batchId,'upload')});
  });
}
export async function patchWrite(request?: Request, id?: string) {
  if (!request && process.env.INSIGHTFLOW_WRITES_ENABLED !== 'true') return rejectWrite();
  return handle(async () => {
    const {client} = await authenticated(request);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(403,'FORBIDDEN','Read-only demo issues cannot be changed');
    const input = await jsonBody(request!,IssuePatchRequest);
    const result = await rpc<{issue:unknown;batchId:string;source:'upload'|'manual'}>(client,'update_feedback_issue',{p_issue_id:id,p_patch:input});
    return json(IssuePatchResponse,{data:IssuePatchResponse.shape.data.parse(result.issue),meta:privateMeta(result.batchId,result.source)});
  });
}
export async function actionWrite(request?: Request, id?: string) {
  if (!request && process.env.INSIGHTFLOW_WRITES_ENABLED !== 'true') return rejectWrite();
  return handle(async () => {
    const {client} = await authenticated(request);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(403,'FORBIDDEN','Read-only demo issues cannot be changed');
    const input = await jsonBody(request!,ActionRequest);
    const result = await rpc<{action:unknown;batchId:string;source:'upload'|'manual'}>(client,'create_feedback_action',{p_issue_id:id,p_input:input});
    return json(ActionResponse,{data:ActionResponse.shape.data.parse(result.action),meta:privateMeta(result.batchId,result.source)});
  });
}
